import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildTurnContext } from '@/lib/chatTurn';
import { MessageRow, query, queryOne } from '@/lib/db';
import { handleApiError } from '@/lib/http';
import { estimateTokens } from '@/lib/llm';
import {
  getEffectiveDailyBudget,
  getTodayTokenUsage,
  getUserSettings,
  requireOwnedChat,
  resolveChatCharacter,
} from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Inspektor Konteks & Estimasi Token untuk ruang percakapan.
 * Menampilkan perkiraan token prompt, lore aktif, memori yang masuk, dan sisa kuota harian.
 */
export async function GET(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const chat = await requireOwnedChat(user.id, id);
    const { character } = await resolveChatCharacter(chat);

    const [settings, recentDesc, totalCountRows, budget, todayUsage] = await Promise.all([
      getUserSettings(user.id),
      query<MessageRow>('SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 60', [id]),
      query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = $1', [id]),
      getEffectiveDailyBudget(user.id),
      getTodayTokenUsage(user.id),
    ]);

    const historyMessages = recentDesc.reverse();
    const ctx = await buildTurnContext({
      userId: user.id,
      chat,
      character,
      historyMessages,
    });

    const systemTokens = estimateTokens(ctx.llmMessages[0]?.content || '');
    const historyTokens = ctx.llmMessages
      .slice(1)
      .reduce((sum, m) => sum + estimateTokens(m.content), 0);

    const isCharOwner = Boolean(
      chat.character_id &&
        (await queryOne<{ id: string }>('SELECT id FROM characters WHERE id = $1 AND user_id = $2', [
          chat.character_id,
          user.id,
        ]))
    );

    return NextResponse.json({
      context: {
        systemTokens,
        historyTokens,
        estimatedTotalInputTokens: systemTokens + historyTokens,
        maxOutputTokens: ctx.maxTokens,
        temperature: ctx.temperature,
        historyLimit: Math.max(4, parseInt(settings.history_limit || '20', 10) || 20),
        includedMessages: Math.max(0, ctx.llmMessages.length - 1),
        totalMessages: Number(totalCountRows[0]?.cnt || 0),
        hasSummary: Boolean(chat.summary && chat.summary.trim()),
        matchedLore: isCharOwner
          ? ctx.matchedLore.map((l) => ({
              id: l.id,
              title: l.title,
              matchedKeywords: l.matchedKeywords,
            }))
          : [],
        activeMemories: ctx.selectedMemories.map((m) => ({
          id: m.id,
          type: m.type,
          content: m.content,
          is_auto: Boolean(m.is_auto),
        })),
        memoryMode: ctx.memoryRetrievalMode,
        quota: {
          used: todayUsage.used,
          calls: todayUsage.calls,
          budget,
          unlimited: budget <= 0,
          remaining: budget > 0 ? Math.max(0, budget - todayUsage.used) : null,
        },
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memeriksa konteks percakapan.');
  }
}
