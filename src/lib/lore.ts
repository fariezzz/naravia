import { LoreEntryRow, query, queryOne, WorldRow } from './db';
import { parseJsonSafe } from './format';

export interface ActiveLoreResult {
  world: WorldRow | null;
  matchedEntries: Array<{
    id: string;
    title: string;
    keywords: string[];
    content: string;
  }>;
}

/**
 * Mengambil informasi Dunia milik pengguna dan entri Lorebook yang kata kuncinya
 * muncul di dalam teks percakapan terakhir.
 */
export async function getRelevantLore(
  userId: string,
  worldId: string | null | undefined,
  recentConversationText: string
): Promise<ActiveLoreResult> {
  if (!worldId) {
    return { world: null, matchedEntries: [] };
  }

  const world = await queryOne<WorldRow>('SELECT * FROM worlds WHERE id = $1 AND user_id = $2', [worldId, userId]);
  if (!world) {
    return { world: null, matchedEntries: [] };
  }

  const entries = await query<LoreEntryRow>(
    'SELECT * FROM lore_entries WHERE world_id = $1 AND enabled = 1',
    [worldId]
  );

  const normalizedHaystack = (recentConversationText || '').toLowerCase();
  const matchedEntries: ActiveLoreResult['matchedEntries'] = [];

  for (const entry of entries) {
    const keywords = parseJsonSafe<string[]>(entry.keywords, []);
    const isMatched = keywords.some((kw) => {
      const cleanedKw = String(kw || '').trim().toLowerCase();
      return cleanedKw.length > 0 && normalizedHaystack.includes(cleanedKw);
    });

    if (isMatched) {
      matchedEntries.push({
        id: entry.id,
        title: entry.title,
        keywords,
        content: entry.content,
      });
    }
  }

  return { world, matchedEntries };
}
