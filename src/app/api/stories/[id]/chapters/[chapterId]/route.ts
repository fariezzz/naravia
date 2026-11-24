import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { StoryChapterRow, StoryRevisionRow, execute, query, queryOne, withTransaction } from '@/lib/db';
import { parseJsonSafe } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { countWords } from '@/lib/llm';
import { formatStoryChapter, formatStoryRevision, triggerBackgroundChapterSummaries } from '@/lib/storyHelpers';
import { requireOwnedStory } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function joinBaseAndVariant(base: string, variant: string): string {
  const b = (base || '').trimEnd();
  const v = (variant || '').trimStart();
  if (!b) return v;
  if (!v) return b;
  return `${b}\n\n${v}`;
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const user = await requireUser(req);
    const { id, chapterId } = await context.params;
    const story = await requireOwnedStory(user.id, id);

    const chapter = await queryOne<StoryChapterRow>(
      'SELECT * FROM story_chapters WHERE id = $1 AND story_id = $2',
      [chapterId, story.id]
    );
    if (!chapter) return jsonError('Bab tidak ditemukan.', 404);

    const body = await readJson(req);

    // Pilih alternatif variasi generasi AI (swipe 1/N)
    if (body.action === 'select_variant') {
      const rev = await queryOne<StoryRevisionRow>(
        'SELECT * FROM story_revisions WHERE chapter_id = $1 ORDER BY created_at DESC LIMIT 1',
        [chapter.id]
      );
      if (!rev) return jsonError('Tidak ada variasi generasi yang tersedia.', 404);
      const variants = parseJsonSafe<string[]>(rev.variants, []);
      const idx = Math.max(0, Math.min(variants.length - 1, Number(body.index || 0)));
      const nextContent = joinBaseAndVariant(rev.base_content, variants[idx] || '');

      await withTransaction(async (client) => {
        await client.query('UPDATE story_revisions SET active_index = $1 WHERE id = $2', [idx, rev.id]);
        await client.query(
          'UPDATE story_chapters SET content = $1, word_count = $2, updated_at = now() WHERE id = $3',
          [nextContent, countWords(nextContent), chapter.id]
        );
        await client.query('UPDATE stories SET updated_at = now() WHERE id = $1', [story.id]);
      });

      const [updatedChapter, updatedRev] = await Promise.all([
        queryOne<StoryChapterRow>('SELECT * FROM story_chapters WHERE id = $1', [chapter.id]),
        queryOne<StoryRevisionRow>('SELECT * FROM story_revisions WHERE id = $1', [rev.id]),
      ]);
      return NextResponse.json({
        chapter: updatedChapter ? formatStoryChapter(updatedChapter, true) : null,
        revision: formatStoryRevision(updatedRev),
      });
    }

    // Urungkan (Undo) blok generasi terakhir ke base_content
    if (body.action === 'undo_revision') {
      const rev = await queryOne<StoryRevisionRow>(
        'SELECT * FROM story_revisions WHERE chapter_id = $1 ORDER BY created_at DESC LIMIT 1',
        [chapter.id]
      );
      if (!rev) return jsonError('Tidak ada riwayat generasi untuk diurungkan.', 404);

      const restoredContent = rev.base_content || '';
      await withTransaction(async (client) => {
        await client.query('DELETE FROM story_revisions WHERE id = $1', [rev.id]);
        await client.query(
          'UPDATE story_chapters SET content = $1, word_count = $2, updated_at = now() WHERE id = $3',
          [restoredContent, countWords(restoredContent), chapter.id]
        );
        await client.query('UPDATE stories SET updated_at = now() WHERE id = $1', [story.id]);
      });

      const [updatedChapter, prevRev] = await Promise.all([
        queryOne<StoryChapterRow>('SELECT * FROM story_chapters WHERE id = $1', [chapter.id]),
        queryOne<StoryRevisionRow>(
          'SELECT * FROM story_revisions WHERE chapter_id = $1 ORDER BY created_at DESC LIMIT 1',
          [chapter.id]
        ),
      ]);
      return NextResponse.json({
        chapter: updatedChapter ? formatStoryChapter(updatedChapter, true) : null,
        revision: formatStoryRevision(prevRev),
      });
    }

    const title = body.title !== undefined ? String(body.title).trim().slice(0, 140) : chapter.title;
    if (!title) return jsonError('Judul bab tidak boleh kosong.', 400);

    const content = body.content !== undefined ? String(body.content) : chapter.content;
    const summary = body.summary !== undefined ? String(body.summary).trim().slice(0, 2500) : chapter.summary;
    const outlineNotes =
      body.outline_notes !== undefined ? String(body.outline_notes).trim().slice(0, 2000) : chapter.outline_notes;
    const status = body.status === 'done' || body.status === 'draft' ? body.status : chapter.status;
    const wordCount = countWords(content);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE story_chapters
         SET title = $1, content = $2, summary = $3, outline_notes = $4,
             word_count = $5, status = $6, updated_at = now()
         WHERE id = $7 AND story_id = $8`,
        [title, content, summary, outlineNotes, wordCount, status, chapter.id, story.id]
      );
      await client.query('UPDATE stories SET updated_at = now() WHERE id = $1', [story.id]);
    });

    const updated = await queryOne<StoryChapterRow>('SELECT * FROM story_chapters WHERE id = $1', [chapter.id]);
    // Jika bab baru saja ditandai selesai dan belum memiliki ringkasan, ringkas otomatis di latar belakang
    if (updated && status === 'done' && chapter.status !== 'done' && !updated.summary?.trim()) {
      triggerBackgroundChapterSummaries(user.id, story.id, [updated]);
    }
    return NextResponse.json({ chapter: updated ? formatStoryChapter(updated, true) : null });
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan bab.');
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const user = await requireUser(req);
    const { id, chapterId } = await context.params;
    const story = await requireOwnedStory(user.id, id);

    const chapters = await query<StoryChapterRow>(
      'SELECT id FROM story_chapters WHERE story_id = $1 ORDER BY chapter_number ASC, created_at ASC',
      [story.id]
    );
    if (chapters.length <= 1) {
      return jsonError('Novel harus memiliki minimal satu bab.', 400);
    }

    const removed = await execute('DELETE FROM story_chapters WHERE id = $1 AND story_id = $2', [chapterId, story.id]);
    if (removed === 0) return jsonError('Bab tidak ditemukan.', 404);

    // Urutkan ulang nomor bab secara rapi
    const remaining = await query<StoryChapterRow>(
      'SELECT * FROM story_chapters WHERE story_id = $1 ORDER BY chapter_number ASC, created_at ASC',
      [story.id]
    );
    await withTransaction(async (client) => {
      for (let i = 0; i < remaining.length; i++) {
        await client.query('UPDATE story_chapters SET chapter_number = $1 WHERE id = $2', [i + 1, remaining[i].id]);
      }
      await client.query('UPDATE stories SET updated_at = now() WHERE id = $1', [story.id]);
    });

    const refreshed = await query<StoryChapterRow>(
      'SELECT * FROM story_chapters WHERE story_id = $1 ORDER BY chapter_number ASC, created_at ASC',
      [story.id]
    );
    return NextResponse.json({ chapters: refreshed.map((c) => formatStoryChapter(c, true)) });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus bab.');
  }
}
