import { NextRequest, NextResponse } from 'next/server';
import { assertAvatarOwnership } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import {
  normalizeExampleDialogues,
  normalizeGreetings,
  normalizeResearchNotes,
  normalizeTags,
  normalizeTemperature,
} from '@/lib/characterInput';
import { CharacterRow, query, queryOne } from '@/lib/db';
import { formatCharacterRow } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { resolveOwnedWorldId } from '@/lib/store';

export const runtime = 'nodejs';

const MAX_CHARACTERS_PER_USER = 300;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const rows = await query<CharacterRow & { chat_count: number; last_chat_at: string | null; world_name: string | null }>(
      `SELECT
         c.*,
         w.name AS world_name,
         COUNT(ch.id) AS chat_count,
         MAX(ch.updated_at) AS last_chat_at
       FROM characters c
       LEFT JOIN worlds w ON c.world_id = w.id
       LEFT JOIN chats ch ON ch.character_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id, w.name
       ORDER BY c.is_pinned DESC, COALESCE(MAX(ch.updated_at), c.updated_at) DESC`,
      [user.id]
    );

    return NextResponse.json({ characters: rows.map(formatCharacterRow) });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat daftar karakter.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const name = String(body.name || '').trim();
    if (!name) return jsonError('Nama karakter wajib diisi.', 400);
    if (name.length > 120) return jsonError('Nama karakter maksimal 120 karakter.', 400);

    const count = await queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM characters WHERE user_id = $1', [user.id]);
    if (Number(count?.cnt || 0) >= MAX_CHARACTERS_PER_USER) {
      return jsonError(`Batas maksimal ${MAX_CHARACTERS_PER_USER} karakter per akun sudah tercapai.`, 400);
    }

    const greetings = normalizeGreetings(body.greeting, name);
    const exampleDialogues = normalizeExampleDialogues(body.example_dialogues);
    const tags = normalizeTags(body.tags);
    const researchNotes = normalizeResearchNotes(body.research_notes);

    const worldId = await resolveOwnedWorldId(user.id, body.world_id);
    const avatar = await assertAvatarOwnership(body.avatar, user.id);
    const id = newId('char');

    const created = await queryOne<CharacterRow>(
      `INSERT INTO characters (
         id, user_id, name, tagline, avatar, description, personality, speaking_style,
         scenario, greeting, example_dialogues, tags, research_notes, world_id,
         is_pinned, is_favorite, temperature_override
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        id,
        user.id,
        name,
        String(body.tagline || '').trim(),
        avatar,
        String(body.description || '').trim(),
        String(body.personality || '').trim(),
        String(body.speaking_style || '').trim(),
        String(body.scenario || '').trim(),
        JSON.stringify(greetings),
        JSON.stringify(exampleDialogues),
        JSON.stringify(tags),
        researchNotes,
        worldId,
        body.is_pinned ? 1 : 0,
        body.is_favorite ? 1 : 0,
        normalizeTemperature(body.temperature_override),
      ]
    );

    return NextResponse.json({ character: formatCharacterRow(created!) }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan karakter baru.');
  }
}
