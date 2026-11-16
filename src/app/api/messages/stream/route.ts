import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildTurnContext, maybeAutoTitle, runBackgroundMemoryTasks } from '@/lib/chatTurn';
import { CharacterRow, ChatRow, execute, MessageRow, nowIso, query, queryOne } from '@/lib/db';
import { formatMessageRow, parseJsonSafe } from '@/lib/format';
import { handleApiError, jsonError, readJson, redactInternalDetails } from '@/lib/http';
import { newId } from '@/lib/ids';
import { cleanCharacterOutput, LLMMessage, streamLLMResponse } from '@/lib/llm';
import { enforceLlmRateLimit } from '@/lib/rateLimit';
import { assertTokenBudget, requireOwnedCharacter, requireOwnedChat, requireOwnedMessage } from '@/lib/store';

// Wajib dinamis agar Next.js tidak men-cache atau mem-buffer respons streaming SSE ini
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 20000;

function sse(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  let charMessageId: string | null = null;
  let isRegenerate = false;

  try {
    const user = await requireUser(req);
    enforceLlmRateLimit(user.id);
    // Cek kuota sebelum menyimpan apa pun agar pengguna mendapat error HTTP yang jelas
    await assertTokenBudget(user.id);

    const body = await readJson(req);
    const action = String(body.action || 'send');
    isRegenerate = action === 'regenerate' || action === 'swipe_generate';

    let chat: ChatRow;
    let character: CharacterRow;
    let llmMessages: LLMMessage[];
    let temperature: number;
    let maxTokens: number;
    let existingAlternatives: string[] = [];
    let userMessageRow: MessageRow | null = null;

    if (isRegenerate) {
      // Alur regenerate / buat alternatif swipe baru
      const msg = await requireOwnedMessage(user.id, String(body.messageId || ''));
      if (msg.role !== 'character') return jsonError('Pesan karakter tidak ditemukan.', 404);

      chat = await requireOwnedChat(user.id, msg.chat_id);
      character = await requireOwnedCharacter(user.id, chat.character_id);

      const allMsgs = await query<MessageRow>('SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC', [chat.id]);
      const msgIdx = allMsgs.findIndex((m) => m.id === msg.id);
      const historyBefore = msgIdx > 0 ? allMsgs.slice(0, msgIdx) : [];

      existingAlternatives = parseJsonSafe<string[]>(msg.alternatives, [msg.content]);
      if (existingAlternatives.length === 0) existingAlternatives = [msg.content];

      const ctx = await buildTurnContext({
        userId: user.id,
        chat,
        character,
        historyMessages: historyBefore,
        isAlternativeVariation: true,
      });
      ({ llmMessages, temperature, maxTokens } = ctx);
      charMessageId = msg.id;
    } else {
      // Alur kirim pesan baru / lanjutkan narasi
      const userText = String(body.content || '').trim();
      if (userText.length > MAX_MESSAGE_LENGTH) return jsonError('Pesan terlalu panjang.', 400);

      chat = await requireOwnedChat(user.id, String(body.chatId || ''));
      character = await requireOwnedCharacter(user.id, chat.character_id);

      if (userText) {
        userMessageRow = await queryOne<MessageRow>(
          `INSERT INTO messages (id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory, created_at)
           VALUES ($1, $2, 'user', $3, $4, 0, 0, $5) RETURNING *`,
          [newId('msg'), chat.id, userText, JSON.stringify([userText]), nowIso()]
        );
      }

      const pastMessages = await query<MessageRow>(
        'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
        [chat.id]
      );
      if (pastMessages.length === 0) {
        return jsonError('Belum ada riwayat percakapan. Tuliskan pesan awal untuk memulai percakapan.', 400);
      }

      const ctx = await buildTurnContext({
        userId: user.id,
        chat,
        character,
        historyMessages: pastMessages,
        isContinuation: Boolean(body.isContinue || !userText),
      });
      ({ llmMessages, temperature, maxTokens } = ctx);

      charMessageId = newId('msg');
      await execute(
        `INSERT INTO messages (id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory, created_at)
         VALUES ($1, $2, 'character', '', '[]', 0, 0, $3)`,
        [charMessageId, chat.id, nowIso(5)]
      );
    }

    const finalChat = chat;
    const finalCharacter = character;
    const finalCharMessageId = charMessageId as string;
    const regenerating = isRegenerate;

    // Simpan teks akhir: alternatif baru (regenerate) atau isi pesan baru
    const persistContent = async (content: string) => {
      if (regenerating) {
        const updatedAlternatives = [...existingAlternatives, content];
        await execute('UPDATE messages SET content = $1, alternatives = $2, active_alt_index = $3 WHERE id = $4', [
          content,
          JSON.stringify(updatedAlternatives),
          updatedAlternatives.length - 1,
          finalCharMessageId,
        ]);
      } else {
        await execute('UPDATE messages SET content = $1, alternatives = $2 WHERE id = $3', [
          content,
          JSON.stringify([content]),
          finalCharMessageId,
        ]);
      }
      await execute('UPDATE chats SET updated_at = now() WHERE id = $1', [finalChat.id]);
      return queryOne<MessageRow>('SELECT * FROM messages WHERE id = $1', [finalCharMessageId]);
    };

    const discardEmptyPlaceholder = async () => {
      if (!regenerating) {
        await execute("DELETE FROM messages WHERE id = $1 AND content = ''", [finalCharMessageId]).catch(() => undefined);
      }
    };

    const stream = new ReadableStream({
      async start(controller) {
        let rawAccumulated = '';

        try {
          controller.enqueue(
            sse({
              type: 'start',
              characterMessageId: finalCharMessageId,
              isRegenerate: regenerating,
              userMessage: userMessageRow ? formatMessageRow(userMessageRow) : null,
            })
          );

          // Sinyal request diteruskan agar tombol Berhenti ikut membatalkan panggilan ke provider
          const gen = streamLLMResponse(llmMessages, {
            userId: user.id,
            characterId: finalCharacter.id,
            chatId: finalChat.id,
            actionType: 'chat',
            temperature,
            maxTokens,
            signal: req.signal,
          });

          for await (const chunk of gen) {
            rawAccumulated += chunk;
            controller.enqueue(sse({ type: 'chunk', text: chunk }));
          }

          // Pembersihan glitch/tag internal dijalankan pada teks utuh, bukan per-chunk
          const finalContent = cleanCharacterOutput(rawAccumulated, finalCharacter.name) || rawAccumulated.trim();
          if (!finalContent) {
            await discardEmptyPlaceholder();
            controller.enqueue(
              sse({ type: 'error', error: 'Model menghasilkan respons kosong. Silakan coba kirim atau generate ulang.' })
            );
            controller.close();
            return;
          }

          const finalRow = await persistContent(finalContent);

          let newTitle: string | null = null;
          let allMsgs: MessageRow[] = [];
          if (!regenerating) {
            allMsgs = await query<MessageRow>('SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC', [
              finalChat.id,
            ]);
            newTitle = await maybeAutoTitle(user.id, finalChat, finalCharacter, allMsgs);
          }

          controller.enqueue(sse({ type: 'done', message: formatMessageRow(finalRow!), title: newTitle }));
          controller.close();

          // Ringkasan & ekstraksi memori berjalan setelah klien menerima balasan
          if (!regenerating) {
            runBackgroundMemoryTasks(user.id, finalChat, finalCharacter, allMsgs).catch(() => undefined);
          }
        } catch (streamErr: any) {
          const isAbort = streamErr?.name === 'AbortError' || req.signal.aborted;

          try {
            if (rawAccumulated.trim()) {
              const cleaned = cleanCharacterOutput(rawAccumulated, finalCharacter.name) || rawAccumulated.trim();
              const savedRow = await persistContent(cleaned);
              controller.enqueue(sse({ type: 'stopped', message: formatMessageRow(savedRow!) }));
            } else {
              await discardEmptyPlaceholder();
              const message = isAbort
                ? 'Balasan dihentikan.'
                : redactInternalDetails(streamErr?.message || 'Gagal streaming balasan.');
              controller.enqueue(sse({ type: 'error', error: message }));
            }
          } catch {
            // Klien sudah memutus koneksi; tidak ada lagi yang perlu dikirim
          }
          try {
            controller.close();
          } catch {}
        }
      },
      async cancel() {
        await discardEmptyPlaceholder();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Mencegah proxy (nginx/Cloudflare) menahan chunk sebelum dikirim ke klien
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    if (charMessageId && !isRegenerate) {
      await execute("DELETE FROM messages WHERE id = $1 AND content = ''", [charMessageId]).catch(() => undefined);
    }
    return handleApiError(err, 'Gagal memproses permintaan chat.');
  }
}
