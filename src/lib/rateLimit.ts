import { HttpError } from './http';

// Pembatas laju berbasis memori (cukup untuk satu instance server).
// Untuk banyak instance, ganti penyimpanan ini dengan Redis.
interface Bucket {
  count: number;
  resetAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __naraviaRateBuckets: Map<string, Bucket> | undefined;
}

function getBuckets(): Map<string, Bucket> {
  if (!global.__naraviaRateBuckets) global.__naraviaRateBuckets = new Map();
  return global.__naraviaRateBuckets;
}

function sweep(buckets: Map<string, Bucket>, now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const buckets = getBuckets();
  const now = Date.now();
  sweep(buckets, now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const res = checkRateLimit(key, limit, windowMs);
  if (!res.ok) {
    throw new HttpError(429, `Terlalu banyak permintaan. Coba lagi dalam ${res.retryAfterSec} detik.`);
  }
}

export function resetRateLimit(key: string) {
  getBuckets().delete(key);
}

// Batas bawaan untuk endpoint yang memanggil model AI
export function enforceLlmRateLimit(userId: string) {
  enforceRateLimit(`llm:${userId}`, 30, 60_000);
}
