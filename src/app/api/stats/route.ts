import { NextResponse } from 'next/server';
import { getDb, getSettingsMap } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const settings = getSettingsMap();
    const dailyBudget = parseInt(settings.daily_token_budget || '1000000', 10) || 1000000;

    const todayPrefix = new Date().toISOString().slice(0, 10);

    const totals = db
      .prepare(`
        SELECT
          COALESCE(SUM(tokens_in), 0) as total_in,
          COALESCE(SUM(tokens_out), 0) as total_out,
          COUNT(*) as total_calls
        FROM token_usage
      `)
      .get() as { total_in: number; total_out: number; total_calls: number };

    const todayTotals = db
      .prepare(`
        SELECT
          COALESCE(SUM(tokens_in), 0) as today_in,
          COALESCE(SUM(tokens_out), 0) as today_out,
          COUNT(*) as today_calls
        FROM token_usage
        WHERE created_at LIKE ?
      `)
      .get(`${todayPrefix}%`) as { today_in: number; today_out: number; today_calls: number };

    const byCharacter = db
      .prepare(`
        SELECT
          c.id as character_id,
          c.name as character_name,
          COALESCE(SUM(t.tokens_in), 0) as tokens_in,
          COALESCE(SUM(t.tokens_out), 0) as tokens_out,
          COUNT(t.id) as call_count
        FROM characters c
        LEFT JOIN token_usage t ON t.character_id = c.id
        GROUP BY c.id
        ORDER BY (COALESCE(SUM(t.tokens_in), 0) + COALESCE(SUM(t.tokens_out), 0)) DESC
      `)
      .all();

    const byChat = db
      .prepare(`
        SELECT
          ch.id as chat_id,
          ch.title as chat_title,
          c.name as character_name,
          COALESCE(SUM(t.tokens_in), 0) as tokens_in,
          COALESCE(SUM(t.tokens_out), 0) as tokens_out,
          COUNT(t.id) as call_count
        FROM chats ch
        JOIN characters c ON ch.character_id = c.id
        LEFT JOIN token_usage t ON t.chat_id = ch.id
        GROUP BY ch.id
        ORDER BY (COALESCE(SUM(t.tokens_in), 0) + COALESCE(SUM(t.tokens_out), 0)) DESC
        LIMIT 15
      `)
      .all();

    const todayUsed = Number(todayTotals.today_in || 0) + Number(todayTotals.today_out || 0);

    return NextResponse.json({
      summary: {
        total_in: Number(totals.total_in || 0),
        total_out: Number(totals.total_out || 0),
        total_tokens: Number(totals.total_in || 0) + Number(totals.total_out || 0),
        total_calls: Number(totals.total_calls || 0),
        today_used: todayUsed,
        today_calls: Number(todayTotals.today_calls || 0),
        daily_budget: dailyBudget,
        remaining_budget: Math.max(0, dailyBudget - todayUsed),
      },
      byCharacter,
      byChat,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat statistik pemakaian token.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
