import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { execute, nowIso, query, queryOne } from '@/lib/db';
import {
  buildGroupTurnContext,
  GROUP_MESSAGES_SQL,
  GroupMessageRow,
  loadGroupMembers,
} from '@/lib/groupTurn';
import { handleApiError, jsonError, readJson, redactInternalDetails } from '@/lib/http';
import { newId } from '@/lib/ids';
import { cleanCharacterOutput, streamLLMResponse } from '@/lib/llm';
import { enforceLlmRateLimit } from '@/lib/rateLimit';
import { assertTokenBudget, requireOwnedGroupChat } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function sse(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest, context: Ctx) {
  let charMsgId: string | null = null;
  let insertedUserMessage: GroupMessageRow | null = null;

  try {
    const user = await requireUser(req);
    enforceLlmRateLimit(user.id);
    await assertTokenBudget(user.id);

    const { id } = await context.params;
    const body = await readJson(req);
    const groupChat = await requireOwnedGroupChat(user.id, id);

    const members = await loadGroupMembers(id, user.id);
    if (members.length === 0) return jsonError('Tidak ada anggota karakter di dalam grup ini.', 400);

    const userContent = String(body.content || '').trim();
    if (userContent.length > 20000) return jsonError('Pesan terlalu panjang.', 400);
    const forcedCharacterId = body.targetCharacterId ? String(body.targetCharacterId) : null;

    if (userContent) {
      insertedUserMessage = await queryOne<GroupMessageRow>(
        `INSERT INTO group_messages (id, group_chat_id, role, character_id, content, created_at)
         VALUES ($1, $2, 'user', NULL, $3, $4) RETURNING *`,
        [newId('gmsg'), id, userContent, nowIso()]
      );
    }

    const history = await query<GroupMessageRow>(
      `${GROUP_MESSAGES_SQL} WHERE gm.group_chat_id = $1 ORDER BY gm.created_at ASC`,
      [id]
    );

    const { speaker, llmMessages, temperature, maxTokens } = await buildGroupTurnContext({
      userId: user.id,
      groupChat,
      members,
      history,
      forcedCharacterId,
    });

    charMsgId = newId('gmsg');
    await execute(
      `INSERT INTO group_messages (id, group_chat_id, role, character_id, content, created_at)
       VALUES ($1, $2, 'character', $3, '', $4)`,
      [charMsgId, id, speaker.id, nowIso(5)]
    );

    const finalCharMsgId = charMsgId;
    const finalUserMsg = insertedUserMessage;

    const persistReply = async (content: string) => {
      await execute('UPDATE group_messages SET content = $1 WHERE id = $2', [content, finalCharMsgId]);
      await execute('UPDATE group_chats SET last_speaker_id = $1, updated_at = now() WHERE id = $2 AND user_id = $3', [
        speaker.id,
        id,
        user.id,
      ]);
      return queryOne<GroupMessageRow>(`${GROUP_MESSAGES_SQL} WHERE gm.id = $1`, [finalCharMsgId]);
    };

    const discardEmpty = async () => {
      await execute("DELETE FROM group_messages WHERE id = $1 AND content = ''", [finalCharMsgId]).catch(
        () => undefined
      );
    };

    const stream = new ReadableStream({
      async start(controller) {
        let rawAccumulated = '';
        try {
          controller.enqueue(
            sse({
              type: 'start',
              characterMessageId: finalCharMsgId,
              speaker: { id: speaker.id, name: speaker.name, avatar: speaker.avatar },
              userMessage: finalUserMsg,
            })
          );

          const gen = streamLLMResponse(llmMessages, {
            userId: user.id,
            characterId: speaker.id,
            chatId: id,
            actionType: 'group_chat',
            temperature,
            maxTokens,
            signal: req.signal,
          });

          for await (const chunk of gen) {
            rawAccumulated += chunk;
            controller.enqueue(sse({ type: 'chunk', text: chunk }));
          }

          const finalContent = cleanCharacterOutput(rawAccumulated, speaker.name) || rawAccumulated.trim();
          if (!finalContent) {
            await discardEmpty();
            controller.enqueue(sse({ type: 'error', error: 'Model menghasilkan respons kosong. Silakan coba lagi.' }));
            controller.close();
            return;
          }

          const saved = await persistReply(finalContent);
          controller.enqueue(sse({ type: 'done', message: saved }));
          controller.close();
        } catch (streamErr: any) {
          const isAbort = streamErr?.name === 'AbortError' || req.signal.aborted;
          try {
            if (rawAccumulated.trim()) {
              const cleaned = cleanCharacterOutput(rawAccumulated, speaker.name) || rawAccumulated.trim();
              const saved = await persistReply(cleaned);
              controller.enqueue(sse({ type: 'stopped', message: saved }));
            } else {
              await discardEmpty();
              const message = isAbort
                ? 'Balasan dihentikan.'
                : redactInternalDetails(streamErr?.message || 'Gagal streaming grup chat.');
              controller.enqueue(sse({ type: 'error', error: message }));
            }
          } catch {}
          try {
            controller.close();
          } catch {}
        }
      },
      async cancel() {
        await discardEmpty();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    if (charMsgId) {
      await execute("DELETE FROM group_messages WHERE id = $1 AND content = ''", [charMsgId]).catch(() => undefined);
    }
    return handleApiError(err, 'Gagal memproses streaming grup chat.');
  }
}
