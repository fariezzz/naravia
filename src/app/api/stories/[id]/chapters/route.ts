import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { StoryChapterRow, execute, query, withTransaction } from '@/lib/db';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { countWords } from '@/lib/llm';
import { formatStoryChapter, triggerBackgroundChapterSummaries } from '@/lib/storyHelpers';
import { requireOwnedStory } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const story = await requireOwnedStory(user.id, id);
    const body = await readJson(req);

    // Urutkan ulang daftar bab
    if (body.action === 'reorder') {
      const orderIds = Array.isArray(body.chapterIds) ? body.chapterIds.map(String) : [];
      if (orderIds.length === 0) return jsonError('Daftar urutan bab tidak valid.', 400);

      await withTransaction(async (client) => {
        for (let i = 0; i < orderIds.length; i++) {
          await client.query(
            'UPDATE story_chapters SET chapter_number = $1 WHERE id = $2 AND story_id = $3',
            [i + 1, orderIds[i], story.id]
          );
        }
        await client.query('UPDATE stories SET updated_at = now() WHERE id = $1', [story.id]);
      });

      const chapters = await query<StoryChapterRow>(
        'SELECT * FROM story_chapters WHERE story_id = $1 ORDER BY chapter_number ASC, created_at ASC',
        [story.id]
      );
      return NextResponse.json({ chapters: chapters.map((c) => formatStoryChapter(c, true)) });
    }

    const prevChapters = await query<StoryChapterRow>(
      'SELECT id, chapter_number, title, content, summary FROM story_chapters WHERE story_id = $1 ORDER BY chapter_number ASC, created_at ASC',
      [story.id]
    );
    const nextNum = prevChapters.length + 1;
    const title = String(body.title || `Bab ${nextNum}`).trim().slice(0, 140) || `Bab ${nextNum}`;
    const content = String(body.content || '').trim();
    const outlineNotes = String(body.outline_notes || '').trim().slice(0, 2000);
    const chapterId = newId('chp');

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO story_chapters (id, story_id, chapter_number, title, content, outline_notes, word_count, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')`,
        [chapterId, story.id, nextNum, title, content, outlineNotes, countWords(content)]
      );
      await client.query('UPDATE stories SET updated_at = now() WHERE id = $1', [story.id]);
    });

    // Ringkas otomatis bab-bab sebelumnya yang sudah berisi naskah namun belum memiliki ringkasan
    if (prevChapters.length > 0) {
      triggerBackgroundChapterSummaries(user.id, story.id, prevChapters);
    }

    const created = await query<StoryChapterRow>('SELECT * FROM story_chapters WHERE id = $1', [chapterId]);
    await execute('UPDATE stories SET updated_at = now() WHERE id = $1', [story.id]);

    return NextResponse.json({ chapter: formatStoryChapter(created[0], true) }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal menambah bab baru.');
  }
}
