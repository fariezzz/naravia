import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
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

  // Avatar yang dipakai karakter publik terbuka untuk siapa pun
  const publik = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM characters WHERE avatar = $1 AND visibility = 'public'`,
    [url]
  );
  if (Number(publik?.cnt || 0) > 0) return 'publik';

  if (!userId) return null;

  // Selain itu, hanya pemilik file atau pemilik entitas yang memakainya
  const milik = await queryOne<{ cnt: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM uploads WHERE filename = $1 AND user_id = $2) +
       (SELECT COUNT(*) FROM characters WHERE avatar = $3 AND user_id = $2) +
       (SELECT COUNT(*) FROM user_personas WHERE avatar = $3 AND user_id = $2)
     ) AS cnt`,
    [filename, userId, url]
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

    const filename = path.basename(subPaths[0]);
    if (!filename || filename.startsWith('.') || filename !== subPaths[0]) {
      return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
    }

    const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
    const fullPath = path.resolve(uploadsDir, filename);
    // Mencegah directory traversal
    if (!fullPath.startsWith(uploadsDir + path.sep)) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    const contentType = MIME_MAP[path.extname(fullPath).toLowerCase()];
    if (!contentType || !fs.existsSync(fullPath)) {
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
