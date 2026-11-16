import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { ensureUploadsDir, MAX_UPLOAD_BYTES } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import { handleApiError, jsonError } from '@/lib/http';
import { newId } from '@/lib/ids';
import { enforceRateLimit } from '@/lib/rateLimit';
import { extractCharacterJsonFromPng, mapCardJsonToNaravia } from '@/lib/sillytavern';
import { getDefaultPersona, registerUpload } from '@/lib/store';

export const runtime = 'nodejs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`import:${user.id}`, 30, 60 * 60_000);

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return jsonError('Pilih file kartu karakter (.json atau .png) terlebih dahulu.', 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError('Ukuran file maksimal 5 MB.', 400);
    }

    const persona = await getDefaultPersona(user.id);
    const userName = persona?.display_name || 'Kamu';
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileNameLower = file.name.toLowerCase();

    let rawJson: Record<string, any>;
    let savedAvatarUrl = '';

    if (fileNameLower.endsWith('.png') || file.type === 'image/png') {
      // Validasi isi file benar-benar PNG, bukan hanya dari ekstensi
      if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        return jsonError('File bukan gambar PNG yang valid.', 400);
      }
      rawJson = extractCharacterJsonFromPng(buffer);

      // Simpan gambar kartu sebagai avatar karakter milik pengguna
      const avatarFileName = `${newId('card')}.png`;
      fs.writeFileSync(path.join(ensureUploadsDir(), avatarFileName), buffer);
      await registerUpload(avatarFileName, user.id, buffer.length);
      savedAvatarUrl = `/uploads/${avatarFileName}`;
    } else if (fileNameLower.endsWith('.json') || file.type.includes('json')) {
      try {
        rawJson = JSON.parse(buffer.toString('utf8'));
      } catch {
        return jsonError('File JSON tidak valid atau rusak.', 400);
      }
    } else {
      return jsonError('Format file tidak didukung. Gunakan file kartu karakter .json atau .png.', 400);
    }

    const mapped = mapCardJsonToNaravia(rawJson, userName);
    // Avatar dari JSON eksternal hanya diterima jika berupa URL https
    const externalAvatar = typeof rawJson.avatar === 'string' && /^https:\/\//i.test(rawJson.avatar) ? rawJson.avatar : '';

    return NextResponse.json({
      draft: {
        ...mapped,
        avatar: savedAvatarUrl || externalAvatar,
        research_notes: JSON.parse(mapped.research_notes),
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal membaca file kartu karakter.', 400);
  }
}
