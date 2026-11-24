import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { deleteUploadAsset, ensureUploadsDir, MAX_UPLOAD_BYTES } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { enforceRateLimit } from '@/lib/rateLimit';
import { registerUpload } from '@/lib/store';

export const runtime = 'nodejs';

// Validasi tipe gambar dari isi file (magic bytes), bukan dari nama file kiriman klien
function detectImageExt(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return '.png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return '.webp';
  }
  return null;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`avatar:${user.id}`, 60, 60 * 60_000);
    const contentType = req.headers.get('content-type') || '';

    // 1. Unggah gambar dari perangkat (WEBP/PNG/JPG; SVG unggahan ditolak karena bisa memuat skrip)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) return jsonError('Pilih file gambar terlebih dahulu.', 400);
      if (file.size > MAX_UPLOAD_BYTES) return jsonError('Ukuran gambar maksimal 5 MB.', 400);

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = detectImageExt(buffer);
      if (!ext) return jsonError('Format gambar harus WEBP, PNG, atau JPG.', 400);

      const aspect = String(formData.get('aspect') || '').toLowerCase();
      const prefix =
        aspect === 'cover'
          ? 'cover'
          : file.name.toLowerCase().startsWith('persona-')
            ? 'persona'
            : 'avatar';
      const filename = `${newId(prefix)}${ext}`;
      fs.writeFileSync(path.join(ensureUploadsDir(), filename), buffer);
      await registerUpload(filename, user.id, buffer.length);

      // Avatar sementara yang tergantikan sebelum disimpan dibersihkan (hanya milik pengguna sendiri)
      const previousAvatarUrl = formData.get('previousAvatarUrl');
      if (typeof previousAvatarUrl === 'string' && previousAvatarUrl) {
        await deleteUploadAsset(previousAvatarUrl, user.id);
      }

      const publicUrl = `/uploads/${filename}`;
      return NextResponse.json({ avatarUrl: publicUrl, url: publicUrl });
    }

    // 2. Generator avatar ilustrasi SVG dari inisial nama (dibuat server, isi aman)
    const body = await readJson(req);
    const name = String(body.name || 'Karakter').trim().slice(0, 120);
    const paletteIndex = Math.abs(Math.floor(Number(body.paletteIndex ?? Math.random() * 6))) || 0;

    const palettes = [
      { bg1: '#EEF2FF', bg2: '#E0E7FF', accent: '#4F46E5', text: '#312E81' },
      { bg1: '#F0FDFA', bg2: '#CCFBF1', accent: '#0D9488', text: '#134E4A' },
      { bg1: '#FFF1F2', bg2: '#FFE4E6', accent: '#E11D48', text: '#881337' },
      { bg1: '#FEF3C7', bg2: '#FDE68A', accent: '#D97706', text: '#78350F' },
      { bg1: '#F3E8FF', bg2: '#E9D5FF', accent: '#7C3AED', text: '#4C1D95' },
      { bg1: '#F1F5F9', bg2: '#E2E8F0', accent: '#334155', text: '#0F172A' },
    ];
    const pal = palettes[paletteIndex % palettes.length];
    const initials =
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('') || 'N';

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${pal.bg1}" />
      <stop offset="100%" stop-color="${pal.bg2}" />
    </linearGradient>
  </defs>
  <rect width="240" height="240" rx="48" fill="url(#g)" />
  <circle cx="190" cy="50" r="64" fill="${pal.accent}" opacity="0.08" />
  <circle cx="45" cy="195" r="72" fill="${pal.accent}" opacity="0.12" />
  <text x="120" y="138" font-family="system-ui, -apple-system, sans-serif" font-size="76" font-weight="700" fill="${pal.text}" text-anchor="middle">${escapeXml(initials)}</text>
</svg>`;

    const filename = `${newId('avatar-gen')}.svg`;
    fs.writeFileSync(path.join(ensureUploadsDir(), filename), svgContent, 'utf8');
    await registerUpload(filename, user.id, Buffer.byteLength(svgContent));

    return NextResponse.json({ avatarUrl: `/uploads/${filename}` });
  } catch (err) {
    return handleApiError(err, 'Gagal memproses avatar.');
  }
}
