import { NextRequest, NextResponse } from 'next/server';

// Error dengan status HTTP dan pesan yang aman ditampilkan ke pengguna
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Sembunyikan alamat server internal (URL, kunci di query string, token Bearer/API key, IP) dari pesan error publik
export function redactInternalDetails(message: string): string {
  return message
    .replace(/https?:\/\/[^\s)'"]+/gi, '[server]')
    .replace(/(key|api_key|token|secret)=[^\s&'"]+/gi, '$1=[disembunyikan]')
    .replace(/Bearer\s+[^\s,'"]+/gi, 'Bearer [disembunyikan]')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[kunci-disembunyikan]')
    .replace(/\bAIza[0-9A-Za-z_-]{15,}\b/g, '[kunci-disembunyikan]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '[host]')
    .slice(0, 400);
}

export function handleApiError(err: unknown, fallback: string, defaultStatus = 500) {
  if (err instanceof HttpError) {
    return jsonError(err.message, err.status);
  }
  console.error(`[api] ${fallback}`, err);
  const raw = err instanceof Error ? err.message : '';
  const message = raw ? redactInternalDetails(raw) : fallback;
  return jsonError(message || fallback, defaultStatus);
}

export function getClientIp(req: NextRequest): string {
  const mode = (process.env.TRUST_PROXY || 'cloudflare').trim().toLowerCase();

  if (mode === 'none') {
    return 'direct';
  }

  // Utamakan header proxy tepercaya (Cloudflare / reverse proxy lokal) alih-alih elemen
  // paling kiri X-Forwarded-For yang mudah dipalsukan langsung oleh klien.
  if (mode === 'cloudflare') {
    const cfIp = req.headers.get('cf-connecting-ip')?.trim();
    if (cfIp) return cfIp;
  }

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      // Elemen paling kanan ditambahkan oleh reverse proxy terakhir yang tepercaya
      return hops[hops.length - 1];
    }
  }

  return 'unknown';
}

export async function readJson<T = any>(req: NextRequest, maxBytes?: number): Promise<T> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'Content-Type permintaan harus application/json.');
  }

  try {
    if (maxBytes && maxBytes > 0) {
      const rawText = await req.text();
      if (Buffer.byteLength(rawText, 'utf8') > maxBytes) {
        throw new HttpError(413, 'Ukuran data permintaan melebihi batas yang diizinkan.');
      }
      return JSON.parse(rawText) as T;
    }
    return (await req.json()) as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Format data permintaan tidak valid.');
  }
}
