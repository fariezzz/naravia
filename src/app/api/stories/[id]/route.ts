import { NextRequest, NextResponse } from 'next/server';
import { assertAvatarOwnership, deleteUploadAsset, replaceUploadAsset } from '@/lib/assets';
import { getSessionUser, requireUser } from '@/lib/auth';
import { StoryCastRow, StoryChapterRow, StoryRevisionRow, query, queryOne, withTransaction } from '@/lib/db';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import {
  formatStory,
  formatStoryCast,
  formatStoryChapter,
  formatStoryRevision,
  resolveCastEntries,
  sanitizeGenre,
  sanitizeLengthPreset,
  sanitizePov,
  sanitizeTags,
  sanitizeTone,
} from '@/lib/storyHelpers';
import { requireOwnedStory, requireVisibleStory, resolveOwnedWorldId } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getSessionUser(req).catch(() => null);
    const story = await requireVisibleStory(user?.id || null, id);

    const [castRows, chapterRows, bookmarkCountRow, userBookmarkRow] = await Promise.all([
      query<StoryCastRow>('SELECT * FROM story_cast WHERE story_id = $1 ORDER BY sort_order ASC, created_at ASC', [
        story.id,
      ]),
      query<StoryChapterRow>(
        'SELECT * FROM story_chapters WHERE story_id = $1 ORDER BY chapter_number ASC, created_at ASC',
        [story.id]
      ),
      queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM story_bookmarks WHERE story_id = $1', [story.id]),
      user
        ? queryOne<{ story_id: string }>(
            'SELECT story_id FROM story_bookmarks WHERE user_id = $1 AND story_id = $2',
            [user.id, story.id]
          )
        : Promise.resolve(null),
    ]);

    // Muat revisi terbaru per bab hanya untuk pemilik cerita (untuk fitur Undo / Coba Versi Lain)
    const revisionsByChapter: Record<string, ReturnType<typeof formatStoryRevision>> = {};
    if (story.is_owner && chapterRows.length > 0) {
      const revRows = await query<StoryRevisionRow>(
        `SELECT DISTINCT ON (chapter_id) *
         FROM story_revisions
         WHERE chapter_id = ANY($1)
         ORDER BY chapter_id, created_at DESC`,
        [chapterRows.map((c) => c.id)]
      );
      for (const rev of revRows) {
        revisionsByChapter[rev.chapter_id] = formatStoryRevision(rev);
      }
    }

    return NextResponse.json({
      story: formatStory(story, {
        bookmarked: Boolean(userBookmarkRow),
        bookmark_count: Number(bookmarkCountRow?.cnt || 0),
      }),
      cast: castRows.map(formatStoryCast),
      chapters: chapterRows.map((ch) => formatStoryChapter(ch, story.is_owner)),
      revisionsByChapter,
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat detail cerita.');
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const existing = await requireOwnedStory(user.id, id);
    const body = await readJson(req);

    const title = body.title !== undefined ? String(body.title).trim().slice(0, 140) : existing.title;
    if (!title) return jsonError('Judul cerita tidak boleh kosong.', 400);

    const synopsis = body.synopsis !== undefined ? String(body.synopsis).trim().slice(0, 3000) : existing.synopsis;
    const genre = body.genre !== undefined ? sanitizeGenre(body.genre) : existing.genre;
    const tagsJson = body.tags !== undefined ? JSON.stringify(sanitizeTags(body.tags)) : existing.tags;
    const pov = body.pov !== undefined ? sanitizePov(body.pov) : existing.pov;
    const tone = body.tone !== undefined ? sanitizeTone(body.tone) : existing.tone;
    const lengthPreset =
      body.length_preset !== undefined ? sanitizeLengthPreset(body.length_preset) : existing.length_preset;
    const writingStyleNotes =
      body.writing_style_notes !== undefined
        ? String(body.writing_style_notes).trim().slice(0, 2000)
        : existing.writing_style_notes;
    const authorsNote =
      body.authors_note !== undefined ? String(body.authors_note).trim().slice(0, 1500) : existing.authors_note;
    const rawTemp = body.temperature !== undefined ? Number(body.temperature) : existing.temperature;
    const temperature = Number.isFinite(rawTemp) ? Math.min(1.5, Math.max(0.1, rawTemp)) : existing.temperature;
    const status =
      body.status === 'completed' || body.status === 'ongoing' ? body.status : existing.status;

    const visibility =
      body.visibility === 'public' || body.visibility === 'private' ? body.visibility : existing.visibility;
    const publishedAt =
      visibility === 'public'
        ? existing.published_at || new Date().toISOString()
        : null;

    const worldId =
      body.world_id !== undefined ? await resolveOwnedWorldId(user.id, body.world_id) : existing.world_id;
    const coverImage =
      body.cover_image !== undefined
        ? await assertAvatarOwnership(body.cover_image, user.id, { allowExternal: visibility !== 'public' })
        : await assertAvatarOwnership(existing.cover_image, user.id, { allowExternal: visibility !== 'public' });

    const nextCast = body.cast !== undefined ? await resolveCastEntries(user.id, body.cast) : null;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE stories
         SET title = $1, synopsis = $2, cover_image = $3, genre = $4, tags = $5,
             world_id = $6, pov = $7, tone = $8, writing_style_notes = $9, authors_note = $10,
             temperature = $11, length_preset = $12, status = $13, visibility = $14,
             published_at = $15, updated_at = now()
         WHERE id = $16 AND user_id = $17`,
        [
          title,
          synopsis,
          coverImage,
          genre,
          tagsJson,
          worldId,
          pov,
          tone,
          writingStyleNotes,
          authorsNote,
          temperature,
          lengthPreset,
          status,
          visibility,
          publishedAt,
          existing.id,
          user.id,
        ]
      );

      if (nextCast !== null) {
        await client.query('DELETE FROM story_cast WHERE story_id = $1', [existing.id]);
        for (let i = 0; i < nextCast.length; i++) {
          const c = nextCast[i];
          await client.query(
            `INSERT INTO story_cast (id, story_id, character_id, character_snapshot, name, role_in_story, bio, current_state, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [newId('cst'), existing.id, c.character_id, c.character_snapshot, c.name, c.role_in_story, c.bio, c.current_state, i]
          );
        }
      }
    });

    if (body.cover_image !== undefined && existing.cover_image && existing.cover_image !== coverImage) {
      await replaceUploadAsset(existing.cover_image, coverImage, user.id);
    }

    const updated = await requireVisibleStory(user.id, existing.id);
    const castRows = await query<StoryCastRow>(
      'SELECT * FROM story_cast WHERE story_id = $1 ORDER BY sort_order ASC, created_at ASC',
      [existing.id]
    );

    return NextResponse.json({
      story: formatStory(updated),
      cast: castRows.map(formatStoryCast),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui cerita.');
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const existing = await requireOwnedStory(user.id, id);

    await withTransaction(async (client) => {
      await client.query('DELETE FROM stories WHERE id = $1 AND user_id = $2', [existing.id, user.id]);
    });

    if (existing.cover_image) {
      await deleteUploadAsset(existing.cover_image, user.id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus cerita.');
  }
}
