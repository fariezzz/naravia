import { execute, MemoryRow, query } from './db';
import { generateEmbedding } from './llm';

export type MemoryRetrievalMode = 'recency' | 'lexical' | 'semantic';

const STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'pada', 'untuk', 'dengan', 'adalah', 'itu', 'ini',
  'aku', 'kamu', 'dia', 'kami', 'kita', 'mereka', 'saya', 'anda', 'tidak', 'bukan',
  'juga', 'atau', 'tapi', 'tetapi', 'karena', 'jika', 'kalau', 'sudah', 'belum', 'akan',
  'bisa', 'dapat', 'harus', 'lagi', 'lebih', 'sangat', 'sekali', 'hanya', 'saja', 'pun',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'was', 'were',
  'are', 'you', 'your', 'not', 'but', 'can', 'will', 'just', 'about', 'into', 'they',
]);

export function parseEmbedding(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'number') {
      return parsed;
    }
  } catch {}
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function tokenizeMemoryText(text: string): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  return matches.filter((token) => !STOPWORDS.has(token));
}

export function lexicalRelevanceScore(queryTokens: Set<string>, memoryContent: string): number {
  if (queryTokens.size === 0 || !memoryContent) return 0;
  const memTokens = new Set(tokenizeMemoryText(memoryContent));
  if (memTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of memTokens) {
    if (queryTokens.has(t)) overlap++;
  }
  if (overlap === 0) return 0;
  // Normalisasi berdasarkan jumlah token unik memori + sedikit bobot jumlah kecocokan
  return Math.min(1, overlap / Math.sqrt(memTokens.size * Math.min(queryTokens.size, 24)));
}

/**
 * Mengurutkan memori menggunakan kombinasi:
 * 1. Kemiripan semantik (cosine similarity) bila embedding tersedia
 * 2. Relevansi leksikal terhadap teks percakapan terakhir
 * 3. Recency decay + prioritas memori yang disematkan manual oleh pengguna
 */
export function rankMemories(
  candidates: MemoryRow[],
  queryText: string,
  queryEmbedding: number[] | null,
  limit = 25
): { memories: MemoryRow[]; mode: MemoryRetrievalMode } {
  if (candidates.length === 0) return { memories: [], mode: 'recency' };

  const queryTokens = new Set(tokenizeMemoryText(queryText));
  const now = Date.now();
  let usedSemantic = false;
  let usedLexical = false;

  const scored = candidates.map((mem, idx) => {
    const vec = queryEmbedding ? parseEmbedding(mem.embedding) : null;
    const semScore = vec && queryEmbedding && vec.length === queryEmbedding.length
      ? Math.max(0, cosineSimilarity(queryEmbedding, vec))
      : null;
    if (semScore !== null) usedSemantic = true;

    const lexScore = lexicalRelevanceScore(queryTokens, mem.content);
    if (lexScore > 0) usedLexical = true;

    const ageDays = Math.max(0, (now - new Date(mem.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = 1 / (1 + ageDays / 14);
    const manualBoost = mem.is_auto ? 0 : 0.12;

    const totalScore =
      semScore !== null
        ? semScore * 0.65 + lexScore * 0.15 + recencyScore * 0.12 + manualBoost
        : lexScore * 0.6 + recencyScore * 0.28 + manualBoost;

    return { mem, totalScore, idx };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore || a.idx - b.idx);

  const mode: MemoryRetrievalMode = usedSemantic ? 'semantic' : usedLexical ? 'lexical' : 'recency';
  return {
    memories: scored.slice(0, limit).map((s) => s.mem),
    mode,
  };
}

/**
 * Menghitung dan menyimpan embedding untuk satu memori secara non-blocking.
 */
export async function saveMemoryEmbedding(memoryId: string, content: string): Promise<void> {
  try {
    const vec = await generateEmbedding(content);
    if (!vec) return;
    await execute('UPDATE memories SET embedding = $1 WHERE id = $2', [JSON.stringify(vec), memoryId]);
  } catch {
    // Kegagalan embedding tidak boleh memutus penyimpanan memori utama
  }
}

/**
 * Mengambil memori paling relevan untuk giliran percakapan saat ini (hibrida semantik + leksikal + recency).
 */
export async function getRelevantMemories(params: {
  userId: string;
  characterId: string | null;
  recentText: string;
  limit?: number;
}): Promise<{ memories: MemoryRow[]; mode: MemoryRetrievalMode }> {
  const limit = params.limit ?? 25;
  const candidates = await query<MemoryRow>(
    `SELECT * FROM memories
     WHERE user_id = $2 AND (character_id = $1 OR character_id IS NULL)
     ORDER BY created_at DESC
     LIMIT 200`,
    [params.characterId, params.userId]
  );

  if (candidates.length === 0) return { memories: [], mode: 'recency' };

  const trimmedQuery = (params.recentText || '').slice(-1500).trim();
  const queryEmbedding = trimmedQuery ? await generateEmbedding(trimmedQuery).catch(() => null) : null;

  // Jika model embedding aktif, lengkapi secara bertahap memori lama yang belum punya vektor di latar belakang
  if (queryEmbedding) {
    const missing = candidates.filter((m) => !m.embedding).slice(0, 4);
    if (missing.length > 0) {
      Promise.all(missing.map((m) => saveMemoryEmbedding(m.id, m.content))).catch(() => undefined);
    }
  }

  return rankMemories(candidates, trimmedQuery, queryEmbedding, limit);
}

export function sanitizeMemoryForClient<T extends Record<string, any>>(row: T): Omit<T, 'user_id' | 'embedding'> {
  const { user_id: _u, embedding: _e, ...rest } = row;
  return rest;
}
