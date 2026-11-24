import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { handleApiError } from '@/lib/http';
import { requireVisibleStory } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const story = await requireVisibleStory(user.id, id);

    const existing = await queryOne<{ story_id: string }>(
      'SELECT story_id FROM story_bookmarks WHERE user_id = $1 AND story_id = $2',
      [user.id, story.id]
    );

    let bookmarked = false;
    if (existing) {
      await execute('DELETE FROM story_bookmarks WHERE user_id = $1 AND story_id = $2', [user.id, story.id]);
      bookmarked = false;
    } else {
      await execute(
        'INSERT INTO story_bookmarks (user_id, story_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [user.id, story.id]
      );
      bookmarked = true;
    }

    const countRow = await queryOne<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM story_bookmarks WHERE story_id = $1',
      [story.id]
    );

    return NextResponse.json({
      bookmarked,
      bookmark_count: Number(countRow?.cnt || 0),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui bookmark cerita.');
  }
}
