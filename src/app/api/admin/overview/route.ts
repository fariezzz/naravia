import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { APP_TIMEZONE, query, queryOne } from '@/lib/db';
import { handleApiError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ringkasan agregat seluruh sistem + log audit terbaru. Khusus admin.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const limit = Math.min(500, Math.max(10, Number(new URL(req.url).searchParams.get('auditLimit')) || 100));

    const [counts, tokenTotals, daily, byAction, topUsers, audit] = await Promise.all([
      queryOne(
        `SELECT
           (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM users WHERE is_active = 1) AS active_users,
           (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins,
           (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE expires_at > now() AND last_seen_at > now() - interval '1 day') AS online_24h,
           (SELECT COUNT(*) FROM characters) AS characters,
           (SELECT COUNT(*) FROM chats) AS chats,
           (SELECT COUNT(*) FROM messages) AS messages,
           (SELECT COUNT(*) FROM group_chats) AS group_chats,
           (SELECT COUNT(*) FROM stories) AS stories,
           (SELECT COUNT(*) FROM story_chapters) AS story_chapters,
           (SELECT COUNT(*) FROM uploads) AS uploads,
           (SELECT COALESCE(SUM(size_bytes), 0) FROM uploads) AS upload_bytes`
      ),
      queryOne(
        `SELECT
           COALESCE(SUM(tokens_in + tokens_out), 0) AS total_tokens,
           COUNT(*) AS total_calls,
           COALESCE(SUM(tokens_in + tokens_out) FILTER (
             WHERE created_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)
           ), 0) AS today_tokens,
           COUNT(*) FILTER (
             WHERE created_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)
           ) AS today_calls
         FROM token_usage`,
        [APP_TIMEZONE]
      ),
      query(
        `SELECT to_char(date_trunc('day', created_at AT TIME ZONE $1), 'YYYY-MM-DD') AS day,
           COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens,
           COUNT(*) AS calls
         FROM token_usage
         WHERE created_at > now() - interval '14 days'
         GROUP BY 1 ORDER BY 1 ASC`,
        [APP_TIMEZONE]
      ),
      query(
        `SELECT action_type, COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens, COUNT(*) AS calls
         FROM token_usage GROUP BY action_type ORDER BY tokens DESC`
      ),
      query(
        `SELECT u.email, u.display_name, COALESCE(SUM(t.tokens_in + t.tokens_out), 0) AS tokens
         FROM users u JOIN token_usage t ON t.user_id = u.id
         WHERE t.created_at > now() - interval '7 days'
         GROUP BY u.id, u.email, u.display_name
         ORDER BY tokens DESC LIMIT 10`
      ),
      query(
        `SELECT id, actor_email, action, detail, ip, created_at FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
        [limit]
      ),
    ]);

    return NextResponse.json({ counts, tokens: { ...tokenTotals, daily, byAction, topUsers }, audit });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat ringkasan admin.');
  }
}
