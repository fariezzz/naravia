import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { handleApiError } from '@/lib/http';
import { getEffectiveDailyBudget, getTodayTokenUsage } from '@/lib/store';

export const runtime = 'nodejs';

// Statistik pemakaian token milik pengguna yang sedang masuk saja
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);

    const [totals, today, budget, byCharacter, byChat] = await Promise.all([
      queryOne<{ total_in: number; total_out: number; total_calls: number }>(
        `SELECT COALESCE(SUM(tokens_in), 0) AS total_in, COALESCE(SUM(tokens_out), 0) AS total_out, COUNT(*) AS total_calls
         FROM token_usage WHERE user_id = $1`,
        [user.id]
      ),
      getTodayTokenUsage(user.id),
      getEffectiveDailyBudget(user.id),
      query(
        `SELECT c.id AS character_id, c.name AS character_name,
           COALESCE(SUM(t.tokens_in), 0) AS tokens_in,
           COALESCE(SUM(t.tokens_out), 0) AS tokens_out,
           COUNT(t.id) AS call_count
         FROM characters c
         LEFT JOIN token_usage t ON t.character_id = c.id AND t.user_id = $1
         WHERE c.user_id = $1
         GROUP BY c.id, c.name
         ORDER BY COALESCE(SUM(t.tokens_in), 0) + COALESCE(SUM(t.tokens_out), 0) DESC`,
        [user.id]
      ),
      query(
        `SELECT ch.id AS chat_id, ch.title AS chat_title, c.name AS character_name,
           COALESCE(SUM(t.tokens_in), 0) AS tokens_in,
           COALESCE(SUM(t.tokens_out), 0) AS tokens_out,
           COUNT(t.id) AS call_count
         FROM chats ch
         JOIN characters c ON ch.character_id = c.id
         LEFT JOIN token_usage t ON t.chat_id = ch.id AND t.user_id = $1
         WHERE ch.user_id = $1
         GROUP BY ch.id, ch.title, c.name
         ORDER BY COALESCE(SUM(t.tokens_in), 0) + COALESCE(SUM(t.tokens_out), 0) DESC
         LIMIT 15`,
        [user.id]
      ),
    ]);

    const totalIn = Number(totals?.total_in || 0);
    const totalOut = Number(totals?.total_out || 0);

    return NextResponse.json({
      summary: {
        total_in: totalIn,
        total_out: totalOut,
        total_tokens: totalIn + totalOut,
        total_calls: Number(totals?.total_calls || 0),
        today_used: today.used,
        today_calls: today.calls,
        // 0 berarti tanpa batas (misalnya akun admin)
        daily_budget: budget,
        remaining_budget: budget > 0 ? Math.max(0, budget - today.used) : null,
      },
      byCharacter,
      byChat,
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat statistik pemakaian token.');
  }
}
