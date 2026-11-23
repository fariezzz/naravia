import type { CharacterRow, LoreEntryRow, MessageRow, WorldRow } from './db';

// Pemformat baris database menjadi objek respons API (tanpa kolom internal seperti user_id)

export function parseJsonSafe<T>(val: string | null | undefined, fallback: T): T {
  try {
    return val ? (JSON.parse(val) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function formatCharacterRow(
  row: CharacterRow & {
    chat_count?: number;
    last_chat_at?: string | null;
    world_name?: string | null;
    creator_name?: string;
    is_owner?: boolean;
    bookmark_count?: number;
    bookmarked?: boolean;
  }
) {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    avatar: row.avatar,
    description: row.description,
    personality: row.personality,
    speaking_style: row.speaking_style,
    scenario: row.scenario,
    greeting: parseJsonSafe<string[]>(row.greeting, []),
    example_dialogues: parseJsonSafe<Array<{ user: string; char: string }>>(row.example_dialogues, []),
    tags: parseJsonSafe<string[]>(row.tags, []),
    research_notes: parseJsonSafe<any>(row.research_notes, {
      mode: 'manual',
      summary: row.research_notes || '',
      sources: [],
      uncertainFields: [],
    }),
    world_id: row.world_id,
    world_name: row.world_name || null,
    is_pinned: Boolean(row.is_pinned),
    is_favorite: Boolean(row.is_favorite),
    temperature_override: row.temperature_override,
    visibility: row.visibility === 'public' ? 'public' : 'private',
    allow_remix: Boolean(row.allow_remix),
    published_at: row.published_at || null,
    // Nama pembuat ditampilkan di profil karakter; email tidak pernah diekspos
    creator_name: row.creator_name || '',
    is_owner: Boolean(row.is_owner),
    bookmark_count: Number(row.bookmark_count || 0),
    bookmarked: Boolean(row.bookmarked),
    chat_count: Number(row.chat_count || 0),
    last_chat_at: row.last_chat_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function formatLoreRow(l: LoreEntryRow) {
  return {
    id: l.id,
    world_id: l.world_id,
    title: l.title,
    keywords: parseJsonSafe<string[]>(l.keywords, []),
    content: l.content,
    enabled: Boolean(l.enabled),
    created_at: l.created_at,
  };
}

export function formatWorldRow(w: WorldRow, loreEntries: LoreEntryRow[] = [], characters: any[] = []) {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    rules: w.rules,
    places: parseJsonSafe<Array<{ name: string; description: string }>>(w.places, []),
    factions: parseJsonSafe<Array<{ name: string; description: string }>>(w.factions, []),
    timeline: parseJsonSafe<Array<{ era: string; event: string }>>(w.timeline, []),
    created_at: w.created_at,
    updated_at: w.updated_at,
    lore_entries: loreEntries.map(formatLoreRow),
    characters,
  };
}

export function formatMessageRow(m: MessageRow) {
  let alternatives = parseJsonSafe<string[]>(m.alternatives, [m.content]);
  if (!Array.isArray(alternatives) || alternatives.length === 0) alternatives = [m.content];
  return {
    ...m,
    alternatives,
    is_pinned_memory: Boolean(m.is_pinned_memory),
  };
}

// Hapus kolom kepemilikan internal sebelum dikirim ke klien
export function stripOwner<T extends Record<string, any>>(row: T): Omit<T, 'user_id'> {
  if (!row) return row;
  const { user_id: _omit, ...rest } = row;
  return rest;
}
