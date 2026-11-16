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

// Sembunyikan alamat server internal (URL, kunci di query string) dari pesan error publik
export function redactInternalDetails(message: string): string {
  return message
    .replace(/https?:\/\/[^\s)'"]+/gi, '[server]')
    .replace(/(key|api_key|token)=[^\s&]+/gi, '$1=[disembunyikan]')
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
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
}

export async function readJson<T = any>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Format data permintaan tidak valid.');
  }
}
