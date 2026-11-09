import { getDb, LoreEntryRow, WorldRow } from './db';

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
 * Mengambil informasi Dunia dan entri Lorebook yang kata kuncinya
 * muncul di dalam teks percakapan terakhir.
 */
export function getRelevantLore(
  worldId: string | null | undefined,
  recentConversationText: string
): ActiveLoreResult {
  if (!worldId) {
    return { world: null, matchedEntries: [] };
  }

  const db = getDb();
  const world = (db
    .prepare('SELECT * FROM worlds WHERE id = ?')
    .get(worldId) as unknown) as WorldRow | undefined;

  if (!world) {
    return { world: null, matchedEntries: [] };
  }

  const entries = (db
    .prepare('SELECT * FROM lore_entries WHERE world_id = ? AND enabled = 1')
    .all(worldId) as unknown) as LoreEntryRow[];

  const normalizedHaystack = (recentConversationText || '').toLowerCase();
  const matchedEntries: ActiveLoreResult['matchedEntries'] = [];

  for (const entry of entries) {
    let keywords: string[] = [];
    try {
      keywords = JSON.parse(entry.keywords || '[]');
    } catch {
      keywords = [];
    }

    const isMatched = keywords.some((kw) => {
      const cleanedKw = kw.trim().toLowerCase();
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

  return {
    world,
    matchedEntries,
  };
}
