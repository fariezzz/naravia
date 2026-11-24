import type { StoryCastRow, StoryChapterRow, StoryRevisionRow, StoryRow } from './db';
import { execute, query, queryOne } from './db';
import { parseJsonSafe, stripOwner } from './format';
import { HttpError } from './http';
import { generateLLMResponse } from './llm';
import { getRelevantLore } from './lore';
import {
  buildCharacterCastBio,
  buildStorySummaryMessages,
  STORY_GENRES,
  STORY_LENGTH_PRESETS,
  STORY_POVS,
  STORY_TONES,
} from './storyPrompt';
import type { VisibleStory } from './store';

// Melacak bab yang sedang diringkas di latar belakang agar tidak duplikat panggilan LLM
const summarizingChapterIds = new Set<string>();

/**
 * Meringkas bab-bab sebelumnya secara otomatis di latar belakang (fire-and-forget)
 * apabila belum memiliki `summary` dan panjang teks memadai.
 * Dibatasi maksimal 2 bab per pemicu agar ramah terhadap kuota token harian.
 */
export function triggerBackgroundChapterSummaries(
  userId: string,
  storyId: string,
  chapters: Array<Pick<StoryChapterRow, 'id' | 'chapter_number' | 'title' | 'content' | 'summary'>>
): void {
  const targets = chapters
    .filter(
      (ch) =>
        !ch.summary?.trim() &&
        (ch.content || '').trim().length >= 120 &&
        !summarizingChapterIds.has(ch.id)
    )
    // Prioritaskan bab paling baru dulu karena paling dekat konteksnya dengan bab aktif
    .slice(-2);

  if (targets.length === 0) return;

  for (const ch of targets) {
    summarizingChapterIds.add(ch.id);
    void (async () => {
      try {
        const llmRes = await generateLLMResponse(buildStorySummaryMessages(ch), {
          userId,
          storyId,
          temperature: 0.3,
          maxTokens: 1600,
          actionType: 'story_summary',
          outputMode: 'story',
        });
        const summary = (llmRes.text || '').trim().slice(0, 2500);
        if (summary) {
          await execute(
            `UPDATE story_chapters SET summary = $1 WHERE id = $2 AND story_id = $3 AND COALESCE(TRIM(summary), '') = ''`,
            [summary, ch.id, storyId]
          );
        }
      } catch (err) {
        console.warn(`[story] Gagal auto-ringkas bab ${ch.chapter_number}:`, err instanceof Error ? err.message : err);
      } finally {
        summarizingChapterIds.delete(ch.id);
      }
    })();
  }
}

export function sanitizeGenre(raw: unknown): string {
  const val = String(raw || '').trim();
  if (!val) return 'Bebas';
  const match = STORY_GENRES.find((g) => g.toLowerCase() === val.toLowerCase());
  return match || val.slice(0, 40);
}

export function sanitizePov(raw: unknown): StoryRow['pov'] {
  const val = String(raw || '').trim();
  return STORY_POVS.some((p) => p.value === val) ? (val as StoryRow['pov']) : 'third_limited';
}

export function sanitizeTone(raw: unknown): StoryRow['tone'] {
  const val = String(raw || '').trim();
  return STORY_TONES.some((t) => t.value === val) ? (val as StoryRow['tone']) : 'sinematik';
}

export function sanitizeLengthPreset(raw: unknown): StoryRow['length_preset'] {
  const val = String(raw || '').trim();
  return STORY_LENGTH_PRESETS.some((l) => l.value === val) ? (val as StoryRow['length_preset']) : 'sedang';
}

export function sanitizeTags(raw: unknown): string[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const clean = String(item || '').trim().replace(/^#+/, '').slice(0, 32);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

export function formatStoryCast(row: StoryCastRow) {
  const snap = parseJsonSafe<Record<string, unknown> | null>(row.character_snapshot, null);
  return {
    id: row.id,
    story_id: row.story_id,
    character_id: row.character_id,
    name: row.name,
    role_in_story: row.role_in_story,
    bio: row.bio,
    current_state: row.current_state,
    avatar: typeof snap?.avatar === 'string' ? snap.avatar : '',
    sort_order: row.sort_order,
  };
}

export function formatStoryChapter(row: StoryChapterRow, includePrivateNotes = true) {
  return {
    id: row.id,
    story_id: row.story_id,
    chapter_number: row.chapter_number,
    title: row.title,
    content: row.content || '',
    summary: includePrivateNotes ? row.summary || '' : '',
    outline_notes: includePrivateNotes ? row.outline_notes || '' : '',
    word_count: Number(row.word_count || 0),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function formatStoryRevision(row: StoryRevisionRow | null) {
  if (!row) return null;
  const variants = parseJsonSafe<string[]>(row.variants, []);
  return {
    id: row.id,
    chapter_id: row.chapter_id,
    kind: row.kind,
    base_content: row.base_content || '',
    variants,
    active_index: Number(row.active_index || 0),
    created_at: row.created_at,
  };
}

export function formatStory(story: VisibleStory, extras?: { bookmarked?: boolean; bookmark_count?: number }) {
  const base = stripOwner(story);
  const isOwner = story.is_owner;
  return {
    ...base,
    tags: parseJsonSafe<string[]>(story.tags, []),
    writing_style_notes: isOwner ? story.writing_style_notes || '' : '',
    authors_note: isOwner ? story.authors_note || '' : '',
    is_owner: isOwner,
    creator_name: story.creator_name,
    world_name: story.world_name,
    bookmarked: Boolean(extras?.bookmarked),
    bookmark_count: Number(extras?.bookmark_count || 0),
  };
}

export function extractJsonObject<T = Record<string, unknown>>(raw: string): T | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function loadStoryGenerationBundle(params: {
  userId: string;
  storyId: string;
  chapterId: string;
  beat?: string;
}) {
  const story = await queryOne<StoryRow>('SELECT * FROM stories WHERE id = $1 AND user_id = $2', [
    params.storyId,
    params.userId,
  ]);
  if (!story) throw new HttpError(404, 'Cerita tidak ditemukan.');

  const [cast, chapters] = await Promise.all([
    query<StoryCastRow>('SELECT * FROM story_cast WHERE story_id = $1 ORDER BY sort_order ASC, created_at ASC', [
      story.id,
    ]),
    query<StoryChapterRow>(
      'SELECT * FROM story_chapters WHERE story_id = $1 ORDER BY chapter_number ASC, created_at ASC',
      [story.id]
    ),
  ]);

  const currentIdx = chapters.findIndex((c) => c.id === params.chapterId);
  if (currentIdx === -1) throw new HttpError(404, 'Bab tidak ditemukan.');

  const currentChapter = chapters[currentIdx];
  const previousChapters = chapters.slice(0, currentIdx);
  const loreHaystack = `${(currentChapter.content || '').slice(-3200)}\n${params.beat || ''}\n${story.authors_note || ''}`;
  const lore = await getRelevantLore(params.userId, story.world_id, loreHaystack, {
    maxEntries: 10,
    maxChars: 4500,
  });

  return { story, cast, chapters, currentChapter, previousChapters, lore };
}

export interface CastInputItem {
  character_id?: string | null;
  persona_id?: string | null;
  name?: string;
  role_in_story?: string;
  bio?: string;
  current_state?: string;
}

export function buildPersonaCastBio(persona: {
  description?: string | null;
  likes?: string | null;
  dislikes?: string | null;
}): string {
  const parts: string[] = [];
  if (persona.description?.trim()) parts.push(persona.description.trim());
  if (persona.likes?.trim()) parts.push(`Menyukai: ${persona.likes.trim()}`);
  if (persona.dislikes?.trim()) parts.push(`Tidak menyukai: ${persona.dislikes.trim()}`);
  return parts.join('\n').trim();
}

/**
 * Menyiapkan data pemeran novel; mendukung tautan ke karakter Naravia milik pengguna/publik,
 * tautan ke Persona pengguna, maupun tokoh lokal khusus cerita.
 */
export async function resolveCastEntries(userId: string, rawCast: unknown) {
  if (!Array.isArray(rawCast)) return [];
  const items = rawCast.slice(0, 20) as CastInputItem[];
  const resolved: Array<{
    character_id: string | null;
    character_snapshot: string | null;
    name: string;
    role_in_story: 'protagonis' | 'antagonis' | 'pendukung';
    bio: string;
    current_state: string;
  }> = [];

  for (const item of items) {
    const roleRaw = String(item?.role_in_story || 'pendukung').toLowerCase();
    const role_in_story = (
      ['protagonis', 'antagonis', 'pendukung'].includes(roleRaw) ? roleRaw : 'pendukung'
    ) as 'protagonis' | 'antagonis' | 'pendukung';

    const charId = item?.character_id ? String(item.character_id).trim() : '';
    if (charId) {
      const charRow = await queryOne<any>(
        `SELECT * FROM characters WHERE id = $1 AND (user_id = $2 OR visibility = 'public')`,
        [charId, userId]
      );
      if (charRow) {
        const snapshot = JSON.stringify({
          id: charRow.id,
          name: charRow.name,
          avatar: charRow.avatar || '',
          tagline: charRow.tagline || '',
        });
        const bio = String(item?.bio || '').trim() || buildCharacterCastBio(charRow);
        resolved.push({
          character_id: charRow.id,
          character_snapshot: snapshot,
          name: String(item?.name || charRow.name).trim().slice(0, 80) || charRow.name,
          role_in_story,
          bio: bio.slice(0, 2000),
          current_state: String(item?.current_state || '').trim().slice(0, 500),
        });
        continue;
      }
    }

    const personaId = item?.persona_id ? String(item.persona_id).trim() : '';
    if (personaId) {
      const personaRow = await queryOne<any>(
        'SELECT * FROM user_personas WHERE id = $1 AND user_id = $2',
        [personaId, userId]
      );
      if (personaRow) {
        const snapshot = JSON.stringify({
          persona_id: personaRow.id,
          name: personaRow.display_name,
          avatar: personaRow.avatar || '',
        });
        const bio = String(item?.bio || '').trim() || buildPersonaCastBio(personaRow);
        resolved.push({
          character_id: null,
          character_snapshot: snapshot,
          name: String(item?.name || personaRow.display_name).trim().slice(0, 80) || personaRow.display_name,
          role_in_story,
          bio: bio.slice(0, 2000),
          current_state: String(item?.current_state || '').trim().slice(0, 500),
        });
        continue;
      }
    }

    const name = String(item?.name || '').trim().slice(0, 80);
    if (!name) continue;
    resolved.push({
      character_id: null,
      character_snapshot: null,
      name,
      role_in_story,
      bio: String(item?.bio || '').trim().slice(0, 2000),
      current_state: String(item?.current_state || '').trim().slice(0, 500),
    });
  }

  return resolved;
}
