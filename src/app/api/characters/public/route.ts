import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { parseJsonSafe } from '@/lib/format';
import { handleApiError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

/**
 * Katalog karakter publik. Terbuka untuk tamu tanpa akun.
 * Mendukung pencarian, filter multi-tag, filter bookmark, filter remixable, dan pengurutan.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req).catch(() => null);
    const url = new URL(req.url);
    const search = url.searchParams.get('q')?.trim().slice(0, 80) || '';
    const singleTag = url.searchParams.get('tag')?.trim().slice(0, 40) || '';
    const multiTagsRaw = url.searchParams.get('tags')?.trim() || '';
    const tags = Array.from(
      new Set(
        [
          ...(singleTag ? [singleTag] : []),
          ...multiTagsRaw
            .split(',')
            .map((t) => t.trim().slice(0, 40))
            .filter(Boolean),
        ].slice(0, 5)
      )
    );
    const bookmarkedOnly = url.searchParams.get('bookmarked') === '1';
    const remixableOnly = url.searchParams.get('remixable') === '1';
    const sortParam = url.searchParams.get('sort');
    const sort = sortParam === 'popular' ? 'popular' : sortParam === 'bookmarked' ? 'bookmarked' : 'terbaru';
    const page = Math.max(1, Math.min(200, parseInt(url.searchParams.get('page') || '1', 10) || 1));
    const offset = (page - 1) * PAGE_SIZE;

    const conditions = ["c.visibility = 'public'"];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.tagline ILIKE $${params.length})`);
    }
    for (const tag of tags) {
      params.push(tag);
      conditions.push(`EXISTS (
        SELECT 1 FROM json_array_elements_text(c.tags::json) AS t
        WHERE lower(t) = lower($${params.length})
      )`);
    }
    if (remixableOnly) {
      conditions.push('c.allow_remix = 1');
    }
    if (bookmarkedOnly) {
      if (!user) {
        return NextResponse.json({
          characters: [],
          availableTags: [],
          page,
          pageSize: PAGE_SIZE,
          total: 0,
          hasMore: false,
        });
      }
      params.push(user.id);
      conditions.push(
        `EXISTS (SELECT 1 FROM character_bookmarks cb WHERE cb.character_id = c.id AND cb.user_id = $${params.length})`
      );
    }

    const where = conditions.join(' AND ');
    const orderBy =
      sort === 'popular'
        ? 'chat_count DESC, bookmark_count DESC, c.published_at DESC NULLS LAST'
        : sort === 'bookmarked'
        ? 'bookmark_count DESC, chat_count DESC, c.published_at DESC NULLS LAST'
        : 'c.published_at DESC NULLS LAST, c.created_at DESC';

    const filterParamsCount = params.length;
    params.push(PAGE_SIZE, offset);
    const limitIdx = filterParamsCount + 1;
    const offsetIdx = filterParamsCount + 2;
    const userIdx = filterParamsCount + 3;

    const [rows, total, tagRows] = await Promise.all([
      query<{
        id: string;
        name: string;
        tagline: string;
        avatar: string;
        description: string;
        tags: string;
        creator_name: string;
        published_at: string | null;
        allow_remix: number;
        chat_count: number;
        bookmark_count: number;
        bookmarked: boolean;
        is_owner: boolean;
      }>(
        `SELECT
           c.id, c.name, c.tagline, c.avatar, c.description, c.tags, c.allow_remix,
           u.display_name AS creator_name,
           c.published_at,
           (SELECT COUNT(*) FROM chats ch WHERE ch.character_id = c.id) AS chat_count,
           (SELECT COUNT(*) FROM character_bookmarks cb WHERE cb.character_id = c.id) AS bookmark_count,
           EXISTS (SELECT 1 FROM character_bookmarks cb WHERE cb.character_id = c.id AND cb.user_id = $${userIdx}) AS bookmarked,
           (c.user_id = $${userIdx}) AS is_owner
         FROM characters c
         JOIN users u ON u.id = c.user_id
         WHERE ${where}
         ORDER BY ${orderBy}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, user?.id || null]
      ),
      queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM characters c WHERE ${where}`,
        params.slice(0, filterParamsCount)
      ),
      page === 1
        ? query<{ tag: string; cnt: number }>(
            `SELECT trim(t) AS tag, COUNT(*) AS cnt
             FROM characters c, LATERAL json_array_elements_text(c.tags::json) AS t
             WHERE c.visibility = 'public' AND length(trim(t)) > 0
             GROUP BY trim(t)
             ORDER BY cnt DESC, tag ASC
             LIMIT 16`
          ).catch(() => [])
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      characters: rows.map((r) => ({
        id: r.id,
        name: r.name,
        tagline: r.tagline,
        avatar: r.avatar,
        description: (r.description || '').slice(0, 220),
        tags: parseJsonSafe<string[]>(r.tags, []),
        creator_name: r.creator_name,
        published_at: r.published_at,
        allow_remix: Boolean(r.allow_remix),
        chat_count: Number(r.chat_count || 0),
        bookmark_count: Number(r.bookmark_count || 0),
        bookmarked: Boolean(r.bookmarked),
        is_owner: Boolean(r.is_owner),
      })),
      ...(page === 1 ? { availableTags: tagRows.map((t) => t.tag) } : {}),
      page,
      pageSize: PAGE_SIZE,
      total: Number(total?.cnt || 0),
      hasMore: offset + rows.length < Number(total?.cnt || 0),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat katalog karakter publik.');
  }
}
