import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

export async function GET(_req: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
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

    const fileBuffer = fs.readFileSync(fullPath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        // SVG yang dibuka langsung di tab tidak boleh menjalankan skrip
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: 'Gagal memuat file.' }, { status: 500 });
  }
}
