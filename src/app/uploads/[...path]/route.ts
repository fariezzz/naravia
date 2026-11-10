import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  try {
    const { path: subPaths } = await context.params;
    if (!subPaths || subPaths.length === 0) {
      return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
    }

    const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
    const safeRelativePath = path.normalize(subPaths.join('/')).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.resolve(uploadsDir, safeRelativePath);

    // Mencegah directory traversal attack
    if (!fullPath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 404 });
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    const fileBuffer = fs.readFileSync(fullPath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat file.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
