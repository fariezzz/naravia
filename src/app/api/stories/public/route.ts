import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { parseJsonSafe } from '@/lib/format';
import { handleApiError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 18;

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req).catch(() => null);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const genreFilter = (searchParams.get('genre') || '').trim().toLowerCase();
    const tagsParam = (searchParams.get('tags') || '').trim();
    const selectedTags = tagsParam
      ? tagsParam
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 5)
      : [];
    const bookmarkedOnly = searchParams.get('bookmarked') === '1';
    const sort = (searchParams.get('sort') || 'terbaru').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    const rows = await query<any>(
      `SELECT s.*,
         u.display_name AS creator_name,
         w.name AS world_name,
         (SELECT COUNT(*) FROM story_chapters ch WHERE ch.story_id = s.id) AS chapter_count,
         (SELECT COALESCE(SUM(ch.word_count), 0) FROM story_chapters ch WHERE ch.story_id = s.id) AS total_words,
         (SELECT COUNT(*) FROM story_bookmarks sb WHERE sb.story_id = s.id) AS bookmark_count,
         CASE WHEN $1::text IS NOT NULL AND EXISTS (
           SELECT 1 FROM story_bookmarks sb WHERE sb.story_id = s.id AND sb.user_id = $1
         ) THEN 1 ELSE 0 END AS bookmarked
       FROM stories s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN worlds w ON w.id = s.world_id
       WHERE s.visibility = 'public'
       ORDER BY s.published_at DESC NULLS LAST, s.updated_at DESC`,
      [user?.id || null]
    );

    const allTagCounts = new Map<string, number>();
    const allGenreSet = new Set<string>();

    const formatted = rows.map((r) => {
      const tags = parseJsonSafe<string[]>(r.tags, []);
      for (const t of tags) {
        allTagCounts.set(t, (allTagCounts.get(t) || 0) + 1);
      }
      if (r.genre) allGenreSet.add(r.genre);
      return {
        id: r.id,
        title: r.title,
        synopsis: r.synopsis || '',
        cover_image: r.cover_image || '',
        genre: r.genre || 'Bebas',
        tags,
        status: r.status,
        world_name: r.world_name || null,
        creator_name: r.creator_name,
        is_owner: Boolean(user && r.user_id === user.id),
        chapter_count: Number(r.chapter_count || 0),
        total_words: Number(r.total_words || 0),
        bookmark_count: Number(r.bookmark_count || 0),
        bookmarked: Boolean(r.bookmarked),
        published_at: r.published_at || r.updated_at,
      };
    });

    let filtered = formatted;
    if (q) {
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.synopsis.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q) ||
          s.creator_name.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (genreFilter) {
      filtered = filtered.filter((s) => s.genre.toLowerCase() === genreFilter);
    }
    if (selectedTags.length > 0) {
      filtered = filtered.filter((s) => {
        const lower = s.tags.map((t) => t.toLowerCase());
        return selectedTags.every((reqTag) => lower.includes(reqTag));
      });
    }
    if (bookmarkedOnly) {
      filtered = filtered.filter((s) => s.bookmarked);
    }

    if (sort === 'bookmarked' || sort === 'popular') {
      filtered = [...filtered].sort(
        (a, b) => b.bookmark_count - a.bookmark_count || b.total_words - a.total_words
      );
    } else if (sort === 'words') {
      filtered = [...filtered].sort((a, b) => b.total_words - a.total_words);
    }

    const total = filtered.length;
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);
    const availableTags = Array.from(allTagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([tag]) => tag);

    return NextResponse.json({
      stories: pageItems,
      total,
      page,
      hasMore: start + PAGE_SIZE < total,
      availableTags,
      availableGenres: Array.from(allGenreSet),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat katalog cerita publik.');
  }
}
