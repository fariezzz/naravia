// In-memory client cache untuk navigasi instan tanpa delay skeleton (Stale-While-Revalidate)
type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function getClientCache<T>(key: string, maxAgeMs = 120000): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    return null;
  }
  return entry.data as T;
}

export function setClientCache<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateClientCache(prefixOrKey?: string): void {
  if (!prefixOrKey) {
    memoryCache.clear();
    return;
  }
  for (const k of memoryCache.keys()) {
    if (k === prefixOrKey || k.startsWith(prefixOrKey)) {
      memoryCache.delete(k);
    }
  }
}
