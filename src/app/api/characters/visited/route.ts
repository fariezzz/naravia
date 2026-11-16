import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handleApiError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ITEMS = 12;

/**
 * Karakter milik pengguna lain yang pernah diajak mengobrol oleh pemanggil.
 * Diturunkan otomatis dari riwayat percakapan, tanpa tabel tambahan.
 *
 * Karakter milik sendiri tidak disertakan karena sudah tampil di grid utama.
 * Satu entri mewakili satu karakter, menunjuk ke percakapan terakhir dengannya.
 *
 * Karakter yang pemiliknya sudah menghapusnya tidak muncul di sini: tautan
 * karakternya lepas (character_id menjadi NULL) sehingga pemiliknya tidak bisa
 * lagi dipastikan. Percakapannya tetap bisa dibuka lewat Percakapan Terakhir.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);

    const rows = await query<{
      id: string;
      chat_id: string;
      name: string;
      tagline: string;
      avatar: string;
      creator_name: string;
      updated_at: string;
      is_locked: boolean;
      chat_count: number;
    }>(
      `SELECT * FROM (
         SELECT DISTINCT ON (ch.character_id)
           ch.character_id AS id,
           ch.id AS chat_id,
           ch.updated_at,
           -- Karakter yang sudah ditarik ke privat memakai identitas dari snapshot,
           -- supaya perubahan yang dibuat pemiliknya setelah itu tidak ikut terlihat
           CASE WHEN c.visibility = 'public' THEN c.name
                ELSE COALESCE(ch.character_snapshot::json->>'name', c.name) END AS name,
           CASE WHEN c.visibility = 'public' THEN c.tagline
                ELSE COALESCE(ch.character_snapshot::json->>'tagline', '') END AS tagline,
           CASE WHEN c.visibility = 'public' THEN c.avatar
                ELSE COALESCE(ch.character_snapshot::json->>'avatar', '') END AS avatar,
           u.display_name AS creator_name,
           (c.visibility <> 'public') AS is_locked,
           (SELECT COUNT(*) FROM chats x WHERE x.character_id = ch.character_id AND x.user_id = $1) AS chat_count
         FROM chats ch
         JOIN characters c ON c.id = ch.character_id
         JOIN users u ON u.id = c.user_id
         WHERE ch.user_id = $1 AND c.user_id <> $1
         ORDER BY ch.character_id, ch.updated_at DESC
       ) AS terakhir
       ORDER BY updated_at DESC
       LIMIT $2`,
      [user.id, MAX_ITEMS]
    );

    return NextResponse.json({
      characters: rows.map((r) => ({
        id: r.id,
        chat_id: r.chat_id,
        name: r.name,
        tagline: r.tagline || '',
        avatar: r.avatar || '',
        creator_name: r.creator_name,
        updated_at: r.updated_at,
        // Profil karakternya tidak bisa dibuka lagi, tetapi riwayat percakapan tetap bisa
        is_locked: Boolean(r.is_locked),
        chat_count: Number(r.chat_count || 0),
      })),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat karakter yang pernah diajak chat.');
  }
}
