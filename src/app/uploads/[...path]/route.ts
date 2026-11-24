import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { isSafeUploadFilename, resolveUploadFilePath } from '@/lib/assets';
import { getSessionUser } from '@/lib/auth';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

/**
 * Menentukan apakah sebuah file unggahan boleh dilihat pemanggil.
 * Otorisasi dilakukan di sini (bukan di middleware) karena avatar karakter publik
 * harus bisa dimuat tamu, sementara avatar karakter dan persona pribadi tidak boleh.
 */
async function resolveAccess(filename: string, userId: string | null): Promise<'publik' | 'pribadi' | null> {
  const url = `/uploads/${filename}`;

  // Avatar karakter publik atau sampul cerita publik terbuka untuk siapa pun
  const publik = await queryOne<{ cnt: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM characters WHERE avatar = $1 AND visibility = 'public') +
       (SELECT COUNT(*) FROM stories WHERE cover_image = $1 AND visibility = 'public')
     ) AS cnt`,
    [url]
  );
  if (Number(publik?.cnt || 0) > 0) return 'publik';

  if (!userId) return null;

  // Selain itu, hanya pemilik file, pemilik entitas yang memakainya,
  // atau pemilik percakapan/cerita yang menyimpan snapshot dengan avatar tersebut
  const quotedUrl = JSON.stringify(url);
  const milik = await queryOne<{ cnt: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM uploads WHERE filename = $1 AND user_id = $2) +
       (SELECT COUNT(*) FROM characters WHERE avatar = $3 AND user_id = $2) +
       (SELECT COUNT(*) FROM user_personas WHERE avatar = $3 AND user_id = $2) +
       (SELECT COUNT(*) FROM stories WHERE cover_image = $3 AND user_id = $2) +
       (SELECT COUNT(*) FROM chats WHERE user_id = $2 AND character_snapshot IS NOT NULL AND POSITION($4 IN character_snapshot) > 0) +
       (SELECT COUNT(*) FROM story_cast sc JOIN stories s ON s.id = sc.story_id WHERE s.user_id = $2 AND sc.character_snapshot IS NOT NULL AND POSITION($4 IN sc.character_snapshot) > 0)
     ) AS cnt`,
    [filename, userId, url, quotedUrl]
  );
  return Number(milik?.cnt || 0) > 0 ? 'pribadi' : null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path: subPaths } = await context.params;
    // Unggahan disimpan datar (tanpa subfolder), jadi hanya satu segmen yang valid
    if (!subPaths || subPaths.length !== 1) {
      return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
    }

    const filename = subPaths[0];
    if (!isSafeUploadFilename(filename)) {
      return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
    }

    const fullPath = resolveUploadFilePath(filename);
    const contentType = fullPath ? MIME_MAP[path.extname(fullPath).toLowerCase()] : undefined;
    if (!fullPath || !contentType) {
      return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
    }

    const user = await getSessionUser(req).catch(() => null);
    const access = await resolveAccess(filename, user?.id || null);
    // File milik orang lain diperlakukan sebagai tidak ada, agar keberadaannya tidak terbocorkan
    if (!access) {
      return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(fullPath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Avatar karakter publik boleh di-cache perantara; avatar pribadi tidak
        'Cache-Control': access === 'publik' ? 'public, max-age=86400' : 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        // SVG yang dibuka langsung di tab tidak boleh menjalankan skrip
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: 'Gagal memuat file.' }, { status: 500 });
  }
}
