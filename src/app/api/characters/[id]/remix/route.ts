import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureUploadsDir, resolveUploadFilePath, uploadFilenameFromUrl } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import { CharacterRow, queryOne } from '@/lib/db';
import { formatCharacterRow } from '@/lib/format';
import { handleApiError, jsonError } from '@/lib/http';
import { newId } from '@/lib/ids';
import { registerUpload, requireVisibleCharacter } from '@/lib/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const MAX_CHARACTERS_PER_USER = 300;

/**
 * Menyalin (Remix) karakter publik yang mengizinkan remix ke koleksi pribadi pengguna.
 * Catatan riset pribadi pembuat tidak ikut disalin, dan avatar lokal diduplikasi
 * menjadi milik pengguna baru agar mandiri.
 */
export async function POST(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const source = await requireVisibleCharacter(user.id, id);

    if (!source.is_owner && !source.allow_remix) {
      return jsonError('Pembuat karakter ini belum mengaktifkan izin Remix.', 403);
    }

    const count = await queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM characters WHERE user_id = $1', [user.id]);
    if (Number(count?.cnt || 0) >= MAX_CHARACTERS_PER_USER) {
      return jsonError(`Batas maksimal ${MAX_CHARACTERS_PER_USER} karakter per akun sudah tercapai.`, 400);
    }

    let clonedAvatar = '';
    const srcFilename = uploadFilenameFromUrl(source.avatar);
    if (srcFilename) {
      const fullSrc = resolveUploadFilePath(srcFilename);
      if (fullSrc && fs.existsSync(fullSrc)) {
        const ext = path.extname(fullSrc) || '.webp';
        const newFilename = `${newId('avatar')}${ext}`;
        const destPath = path.join(ensureUploadsDir(), newFilename);
        fs.copyFileSync(fullSrc, destPath);
        const size = fs.statSync(destPath).size;
        await registerUpload(newFilename, user.id, size);
        clonedAvatar = `/uploads/${newFilename}`;
      }
    } else if (/^https:\/\//i.test(source.avatar || '')) {
      clonedAvatar = source.avatar;
    }

    const remixNotes = JSON.stringify({
      mode: 'remix',
      summary: `Disalin (Remix) dari karakter publik "${source.name}" oleh ${source.creator_name || 'Pengguna Naravia'}.`,
      sources: [],
      uncertainFields: [],
    });

    const newCharId = newId('char');
    const created = await queryOne<CharacterRow>(
      `INSERT INTO characters (
         id, user_id, name, tagline, avatar, description, personality, speaking_style,
         scenario, greeting, example_dialogues, tags, research_notes, world_id,
         is_pinned, is_favorite, temperature_override, visibility, allow_remix
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL, 0, 0, $14, 'private', 0)
       RETURNING *`,
      [
        newCharId,
        user.id,
        `${source.name} (Remix)`.slice(0, 120),
        source.tagline,
        clonedAvatar,
        source.description,
        source.personality,
        source.speaking_style,
        source.scenario,
        source.greeting,
        source.example_dialogues,
        source.tags,
        remixNotes,
        source.temperature_override,
      ]
    );

    return NextResponse.json({ character: formatCharacterRow({ ...created!, is_owner: true }) }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal menyalin (remix) karakter.');
  }
}
