import { NextRequest, NextResponse } from 'next/server';
import { assertAvatarOwnership } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import { query, withTransaction } from '@/lib/db';
import { parseJsonSafe } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { countWords } from '@/lib/llm';
import {
  resolveCastEntries,
  sanitizeGenre,
  sanitizeLengthPreset,
  sanitizePov,
  sanitizeTags,
  sanitizeTone,
} from '@/lib/storyHelpers';
import { resolveOwnedWorldId } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const statusFilter = (searchParams.get('status') || '').trim();
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    const rows = await query<any>(
      `SELECT s.*,
         w.name AS world_name,
         (SELECT COUNT(*) FROM story_chapters ch WHERE ch.story_id = s.id) AS chapter_count,
         (SELECT COALESCE(SUM(ch.word_count), 0) FROM story_chapters ch WHERE ch.story_id = s.id) AS total_words,
         (SELECT ch.id FROM story_chapters ch WHERE ch.story_id = s.id ORDER BY ch.updated_at DESC, ch.chapter_number DESC LIMIT 1) AS latest_chapter_id,
         (SELECT ch.title FROM story_chapters ch WHERE ch.story_id = s.id ORDER BY ch.updated_at DESC, ch.chapter_number DESC LIMIT 1) AS latest_chapter_title,
         (SELECT ch.chapter_number FROM story_chapters ch WHERE ch.story_id = s.id ORDER BY ch.updated_at DESC, ch.chapter_number DESC LIMIT 1) AS latest_chapter_number,
         (SELECT COUNT(*) FROM story_bookmarks sb WHERE sb.story_id = s.id) AS bookmark_count
       FROM stories s
       LEFT JOIN worlds w ON w.id = s.world_id
       WHERE s.user_id = $1
       ORDER BY s.updated_at DESC`,
      [user.id]
    );

    const storyIds = rows.map((r) => r.id);
    const castByStory = new Map<string, Array<{ name: string; avatar: string; role_in_story: string }>>();
    if (storyIds.length > 0) {
      const castRows = await query<any>(
        `SELECT story_id, name, role_in_story, character_snapshot
         FROM story_cast
         WHERE story_id = ANY($1)
         ORDER BY sort_order ASC, created_at ASC`,
        [storyIds]
      );
      for (const c of castRows) {
        const list = castByStory.get(c.story_id) || [];
        if (list.length < 4) {
          const snap = parseJsonSafe<Record<string, unknown> | null>(c.character_snapshot, null);
          list.push({
            name: c.name,
            role_in_story: c.role_in_story,
            avatar: typeof snap?.avatar === 'string' ? snap.avatar : '',
          });
          castByStory.set(c.story_id, list);
        }
      }
    }

    let stories = rows.map((r) => ({
      id: r.id,
      title: r.title,
      synopsis: r.synopsis || '',
      cover_image: r.cover_image || '',
      genre: r.genre || 'Bebas',
      tags: parseJsonSafe<string[]>(r.tags, []),
      world_id: r.world_id,
      world_name: r.world_name || null,
      pov: r.pov,
      tone: r.tone,
      length_preset: r.length_preset,
      status: r.status,
      visibility: r.visibility,
      published_at: r.published_at,
      chapter_count: Number(r.chapter_count || 0),
      total_words: Number(r.total_words || 0),
      latest_chapter_id: r.latest_chapter_id || null,
      latest_chapter_title: r.latest_chapter_title || null,
      latest_chapter_number: Number(r.latest_chapter_number || 1),
      bookmark_count: Number(r.bookmark_count || 0),
      cast_preview: castByStory.get(r.id) || [],
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    if (statusFilter === 'ongoing' || statusFilter === 'completed') {
      stories = stories.filter((s) => s.status === statusFilter);
    }
    if (q) {
      stories = stories.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.synopsis.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({ stories });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat daftar cerita.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);

    const title = String(body.title || '').trim().slice(0, 140);
    if (!title) return jsonError('Judul cerita wajib diisi.', 400);

    const synopsis = String(body.synopsis || '').trim().slice(0, 3000);
    const genre = sanitizeGenre(body.genre);
    const tags = sanitizeTags(body.tags);
    const pov = sanitizePov(body.pov);
    const tone = sanitizeTone(body.tone);
    const lengthPreset = sanitizeLengthPreset(body.length_preset);
    const writingStyleNotes = String(body.writing_style_notes || '').trim().slice(0, 2000);
    const authorsNote = String(body.authors_note || '').trim().slice(0, 1500);
    const rawTemp = Number(body.temperature);
    const temperature = Number.isFinite(rawTemp) ? Math.min(1.5, Math.max(0.1, rawTemp)) : 0.85;

    const [worldId, coverImage, castEntries] = await Promise.all([
      resolveOwnedWorldId(user.id, body.world_id),
      assertAvatarOwnership(body.cover_image, user.id),
      resolveCastEntries(user.id, body.cast),
    ]);

    const initialChaptersIn = Array.isArray(body.chapters) ? body.chapters.slice(0, 15) : [];
    const openingParagraph = String(body.opening_paragraph || '').trim().slice(0, 15000);

    const storyId = newId('sty');
    let firstChapterId = '';

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO stories (
           id, user_id, title, synopsis, cover_image, genre, tags, world_id,
           pov, tone, writing_style_notes, authors_note, temperature, length_preset, status, visibility
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'ongoing','private')`,
        [
          storyId,
          user.id,
          title,
          synopsis,
          coverImage,
          genre,
          JSON.stringify(tags),
          worldId,
          pov,
          tone,
          writingStyleNotes,
          authorsNote,
          temperature,
          lengthPreset,
        ]
      );

      for (let i = 0; i < castEntries.length; i++) {
        const c = castEntries[i];
        await client.query(
          `INSERT INTO story_cast (id, story_id, character_id, character_snapshot, name, role_in_story, bio, current_state, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [newId('cst'), storyId, c.character_id, c.character_snapshot, c.name, c.role_in_story, c.bio, c.current_state, i]
        );
      }

      if (initialChaptersIn.length > 0) {
        for (let i = 0; i < initialChaptersIn.length; i++) {
          const ch = initialChaptersIn[i];
          const chId = newId('chp');
          if (i === 0) firstChapterId = chId;
          const chTitle = String(ch?.title || `Bab ${i + 1}`).trim().slice(0, 140) || `Bab ${i + 1}`;
          const chOutline = String(ch?.outline_notes || '').trim().slice(0, 2000);
          const chContent = i === 0 ? String(ch?.content || openingParagraph || '').trim() : String(ch?.content || '').trim();
          await client.query(
            `INSERT INTO story_chapters (id, story_id, chapter_number, title, content, outline_notes, word_count, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')`,
            [chId, storyId, i + 1, chTitle, chContent, chOutline, countWords(chContent)]
          );
        }
      } else {
        firstChapterId = newId('chp');
        await client.query(
          `INSERT INTO story_chapters (id, story_id, chapter_number, title, content, outline_notes, word_count, status)
           VALUES ($1,$2,1,$3,$4,'',$5,'draft')`,
          [firstChapterId, storyId, 'Bab Pembuka', openingParagraph, countWords(openingParagraph)]
        );
      }
    });

    return NextResponse.json({ story: { id: storyId, title, first_chapter_id: firstChapterId } }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal membuat cerita baru.');
  }
}
