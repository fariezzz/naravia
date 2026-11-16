// Normalisasi input array kartu karakter dari body permintaan
export function normalizeGreetings(raw: unknown, fallbackName?: string): string[] {
  if (Array.isArray(raw)) return raw.map((g) => String(g || '').trim()).filter(Boolean).slice(0, 20);
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return fallbackName ? [`Halo, aku ${fallbackName}. Senang bisa mengobrol denganmu.`] : [];
}

export function normalizeExampleDialogues(raw: unknown): Array<{ user: string; char: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d: any) => ({ user: String(d?.user || '').trim(), char: String(d?.char || '').trim() }))
    .filter((d) => d.user || d.char)
    .slice(0, 30);
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 20);
}

export function normalizeResearchNotes(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null) return JSON.stringify(raw);
  return String(raw || '');
}

// Hanya dua nilai yang diizinkan; input lain dianggap privat agar tidak ada
// karakter yang tidak sengaja terbuka ke publik
export function normalizeVisibility(raw: unknown): 'private' | 'public' {
  return String(raw || '').trim().toLowerCase() === 'public' ? 'public' : 'private';
}

export function normalizeTemperature(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(2, Math.max(0, n));
}
