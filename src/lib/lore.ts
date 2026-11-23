import { LoreEntryRow, query, queryOne, WorldRow } from './db';
import { parseJsonSafe } from './format';

export interface MatchedLoreEntry {
  id: string;
  title: string;
  keywords: string[];
  matchedKeywords: string[];
  content: string;
}

export interface ActiveLoreResult {
  world: WorldRow | null;
  matchedEntries: MatchedLoreEntry[];
}

export const DEFAULT_MAX_LORE_ENTRIES = 8;
export const DEFAULT_MAX_LORE_CHARS = 3500;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mencocokkan kata kunci pada batas kata Unicode agar kata pendek (mis. "api")
 * tidak salah memicu pada kata lain (mis. "tapi" atau "rapi").
 */
export function keywordMatchesText(keyword: string, haystack: string): boolean {
  const kw = keyword.trim();
  if (!kw || !haystack) return false;
  const escaped = escapeRegex(kw);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu');
  return pattern.test(haystack);
}

/**
 * Menyaring, mengurutkan berdasarkan jumlah & kekhususan kecocokan kata kunci,
 * dan membatasi jumlah entri/karakter lore agar konteks prompt tetap terkendali.
 */
export function matchLoreEntries(
  entries: LoreEntryRow[],
  recentConversationText: string,
  options?: { maxEntries?: number; maxChars?: number }
): MatchedLoreEntry[] {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_LORE_ENTRIES;
  const maxChars = options?.maxChars ?? DEFAULT_MAX_LORE_CHARS;
  const haystack = recentConversationText || '';
  if (!haystack.trim() || entries.length === 0) return [];

  const scored: Array<{ entry: MatchedLoreEntry; score: number }> = [];

  for (const entry of entries) {
    const keywords = parseJsonSafe<string[]>(entry.keywords, []).map((k) => String(k || '').trim()).filter(Boolean);
    const matchedKeywords = keywords.filter((kw) => keywordMatchesText(kw, haystack));
    if (matchedKeywords.length === 0) continue;

    // Entri dengan lebih banyak kecocokan atau kata kunci lebih spesifik mendapat prioritas lebih tinggi
    const specificity = matchedKeywords.reduce((sum, kw) => sum + Math.min(kw.length, 24), 0);
    const score = matchedKeywords.length * 100 + specificity;

    scored.push({
      score,
      entry: {
        id: entry.id,
        title: entry.title,
        keywords,
        matchedKeywords,
        content: entry.content,
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const selected: MatchedLoreEntry[] = [];
  let usedChars = 0;

  for (const item of scored) {
    if (selected.length >= maxEntries) break;
    const entryLen = (item.entry.title?.length || 0) + (item.entry.content?.length || 0);
    if (selected.length > 0 && usedChars + entryLen > maxChars) continue;
    selected.push(item.entry);
    usedChars += entryLen;
  }

  return selected;
}

/**
 * Mengambil informasi Dunia dan entri Lorebook yang relevan dengan percakapan terakhir.
 * Untuk karakter publik, dunia yang tertaut pada karakter publik tersebut ikut diizinkan
 * sebagai konteks percakapan (tanpa mengekspos kontrol edit milik pembuatnya).
 */
export async function getRelevantLore(
  userId: string,
  worldId: string | null | undefined,
  recentConversationText: string,
  options?: { allowPublicWorld?: boolean; maxEntries?: number; maxChars?: number }
): Promise<ActiveLoreResult> {
  if (!worldId) {
    return { world: null, matchedEntries: [] };
  }

  const world = options?.allowPublicWorld
    ? await queryOne<WorldRow>(
        `SELECT w.* FROM worlds w
         WHERE w.id = $1
           AND (
             w.user_id = $2
             OR EXISTS (SELECT 1 FROM characters c WHERE c.world_id = w.id AND c.visibility = 'public')
           )`,
        [worldId, userId]
      )
    : await queryOne<WorldRow>('SELECT * FROM worlds WHERE id = $1 AND user_id = $2', [worldId, userId]);

  if (!world) {
    return { world: null, matchedEntries: [] };
  }

  const entries = await query<LoreEntryRow>(
    'SELECT * FROM lore_entries WHERE world_id = $1 AND enabled = 1 ORDER BY created_at ASC',
    [worldId]
  );

  const matchedEntries = matchLoreEntries(entries, recentConversationText, options);
  return { world, matchedEntries };
}
