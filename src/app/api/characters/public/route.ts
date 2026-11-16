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
 * Hanya mengembalikan kolom yang memang untuk dipamerkan: tidak ada research_notes,
 * example_dialogues, scenario, maupun identitas pembuat selain nama tampilan.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req).catch(() => null);
    const url = new URL(req.url);
    const search = url.searchParams.get('q')?.trim().slice(0, 80) || '';
    const tag = url.searchParams.get('tag')?.trim().slice(0, 40) || '';
    const sort = url.searchParams.get('sort') === 'popular' ? 'popular' : 'terbaru';
    const page = Math.max(1, Math.min(200, parseInt(url.searchParams.get('page') || '1', 10) || 1));
    const offset = (page - 1) * PAGE_SIZE;

    const conditions = ["c.visibility = 'public'"];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.tagline ILIKE $${params.length})`);
    }
    if (tag) {
      params.push(tag);
      // tags disimpan sebagai JSON array string
      conditions.push(`EXISTS (
        SELECT 1 FROM json_array_elements_text(c.tags::json) AS t
        WHERE lower(t) = lower($${params.length})
      )`);
    }

    const where = conditions.join(' AND ');
    const orderBy =
      sort === 'popular'
        ? 'chat_count DESC, c.published_at DESC NULLS LAST'
        : 'c.published_at DESC NULLS LAST, c.created_at DESC';

    params.push(PAGE_SIZE, offset);

    const rows = await query<{
      id: string;
      name: string;
      tagline: string;
      avatar: string;
      description: string;
      tags: string;
      creator_name: string;
      published_at: string | null;
      chat_count: number;
      is_owner: boolean;
    }>(
      `SELECT
         c.id, c.name, c.tagline, c.avatar, c.description, c.tags,
         u.display_name AS creator_name,
         c.published_at,
         (SELECT COUNT(*) FROM chats ch WHERE ch.character_id = c.id) AS chat_count,
         (c.user_id = $${params.length + 1}) AS is_owner
       FROM characters c
       JOIN users u ON u.id = c.user_id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      [...params, user?.id || null]
    );

    const total = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM characters c WHERE ${where}`,
      params.slice(0, params.length - 2)
    );

    return NextResponse.json({
      characters: rows.map((r) => ({
        id: r.id,
        name: r.name,
        tagline: r.tagline,
        avatar: r.avatar,
        // Deskripsi dipotong karena daftar hanya perlu gambaran singkat
        description: (r.description || '').slice(0, 220),
        tags: parseJsonSafe<string[]>(r.tags, []),
        creator_name: r.creator_name,
        published_at: r.published_at,
        chat_count: Number(r.chat_count || 0),
        is_owner: Boolean(r.is_owner),
      })),
      page,
      pageSize: PAGE_SIZE,
      total: Number(total?.cnt || 0),
      hasMore: offset + rows.length < Number(total?.cnt || 0),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat katalog karakter publik.');
  }
}
