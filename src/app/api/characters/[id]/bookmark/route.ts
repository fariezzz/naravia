import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { handleApiError } from '@/lib/http';
import { requireVisibleCharacter } from '@/lib/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Menambah atau menghapus bookmark pada karakter publik / milik sendiri.
 */
export async function POST(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    await requireVisibleCharacter(user.id, id);

    const existing = await queryOne<{ character_id: string }>(
      'SELECT character_id FROM character_bookmarks WHERE user_id = $1 AND character_id = $2',
      [user.id, id]
    );

    let bookmarked = false;
    if (existing) {
      await execute('DELETE FROM character_bookmarks WHERE user_id = $1 AND character_id = $2', [user.id, id]);
      bookmarked = false;
    } else {
      await execute(
        'INSERT INTO character_bookmarks (user_id, character_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [user.id, id]
      );
      bookmarked = true;
    }

    const cntRow = await queryOne<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM character_bookmarks WHERE character_id = $1',
      [id]
    );

    return NextResponse.json({
      bookmarked,
      bookmark_count: Number(cntRow?.cnt || 0),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui bookmark karakter.');
  }
}
