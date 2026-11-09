import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getDefaultPersona } from '@/lib/db';
import { extractCharacterJsonFromPng, mapCardJsonToNaravia } from '@/lib/sillytavern';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Pilih file kartu karakter (.json atau .png) terlebih dahulu.' }, { status: 400 });
    }

    const persona = getDefaultPersona();
    const userName = persona?.display_name || 'Kamu';

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileNameLower = file.name.toLowerCase();

    let rawJson: Record<string, any>;
    let savedAvatarUrl = '';

    if (fileNameLower.endsWith('.png') || file.type === 'image/png') {
      rawJson = extractCharacterJsonFromPng(buffer);

      // Simpan gambar PNG tersebut sebagai avatar karakter di public/uploads
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const avatarFileName = `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;
      fs.writeFileSync(path.join(uploadsDir, avatarFileName), buffer);
      savedAvatarUrl = `/uploads/${avatarFileName}`;
    } else if (fileNameLower.endsWith('.json') || file.type.includes('json')) {
      try {
        rawJson = JSON.parse(buffer.toString('utf8'));
      } catch {
        return NextResponse.json({ error: 'File JSON tidak valid atau rusak.' }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: 'Format file tidak didukung. Gunakan file kartu karakter .json atau .png.' },
        { status: 400 }
      );
    }

    const mapped = mapCardJsonToNaravia(rawJson, userName);
    return NextResponse.json({
      draft: {
        ...mapped,
        avatar: savedAvatarUrl || rawJson.avatar || '',
        research_notes: JSON.parse(mapped.research_notes),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal membaca file kartu karakter.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
