import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { deleteUploadAsset } from '@/lib/assets';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // 1. Jika unggah file gambar dari perangkat
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'Pilih file gambar terlebih dahulu.' }, { status: 400 });
      }

      const ext = path.extname(file.name).toLowerCase() || '.webp';
      const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
      if (!allowed.includes(ext)) {
        return NextResponse.json(
          { error: 'Format gambar harus WEBP, PNG, JPG, JPEG, atau SVG.' },
          { status: 400 }
        );
      }

      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const prefix = file.name.toLowerCase().startsWith('persona-') ? 'persona' : 'avatar';
      const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);

      // Jika ada referensi avatar sebelumnya yang digantikan dan belum tersimpan di database, bersihkan segera
      const previousAvatarUrl = formData.get('previousAvatarUrl');
      if (previousAvatarUrl && typeof previousAvatarUrl === 'string') {
        deleteUploadAsset(previousAvatarUrl);
      }

      return NextResponse.json({ avatarUrl: `/uploads/${filename}` });
    }

    // 2. Generator Avatar Ilustrasi SVG (Fase 3)
    const body = await req.json();
    const name = String(body.name || 'Karakter').trim();
    const paletteIndex = Number(body.paletteIndex ?? Math.floor(Math.random() * 6));

    const palettes = [
      { bg1: '#EEF2FF', bg2: '#E0E7FF', accent: '#4F46E5', text: '#312E81' },
      { bg1: '#F0FDFA', bg2: '#CCFBF1', accent: '#0D9488', text: '#134E4A' },
      { bg1: '#FFF1F2', bg2: '#FFE4E6', accent: '#E11D48', text: '#881337' },
      { bg1: '#FEF3C7', bg2: '#FDE68A', accent: '#D97706', text: '#78350F' },
      { bg1: '#F3E8FF', bg2: '#E9D5FF', accent: '#7C3AED', text: '#4C1D95' },
      { bg1: '#F1F5F9', bg2: '#E2E8F0', accent: '#334155', text: '#0F172A' },
    ];
    const pal = palettes[paletteIndex % palettes.length];
    const initials = name
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
  <text x="120" y="138" font-family="system-ui, -apple-system, sans-serif" font-size="76" font-weight="700" fill="${pal.text}" text-anchor="middle">${initials}</text>
</svg>`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filename = `avatar-gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.svg`;
    fs.writeFileSync(path.join(uploadsDir, filename), svgContent, 'utf8');

    return NextResponse.json({ avatarUrl: `/uploads/${filename}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memproses avatar.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
