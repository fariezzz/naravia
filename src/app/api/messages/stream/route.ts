import { NextRequest, NextResponse } from 'next/server';
import { buildCharacterSystemPrompt } from '@/lib/character';
import {
  CharacterRow,
  ChatRow,
  getDb,
  getDefaultPersona,
  getPersonaById,
  getSettingsMap,
  MemoryRow,
  MessageRow,
  UserPersonaRow,
} from '@/lib/db';
import {
  cleanCharacterOutput,
  generateLLMResponse,
  LLMMessage,
  streamLLMResponse,
} from '@/lib/llm';
import { getRelevantLore } from '@/lib/lore';

// Wajib dinamis agar Next.js tidak men-cache atau mem-buffer respons streaming SSE ini
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function formatMessageRow(m: MessageRow) {
  let alternatives: string[] = [];
  try {
    alternatives = JSON.parse(m.alternatives || '[]');
  } catch {
    alternatives = [m.content];
  }
  if (alternatives.length === 0) alternatives = [m.content];
  return {
    ...m,
    alternatives,
    is_pinned_memory: Boolean(m.is_pinned_memory),
  };
}

function resolveChatPersona(chat: ChatRow): UserPersonaRow | null {
  if (chat.persona_id) {
    return getPersonaById(chat.persona_id);
  }
  if (chat.use_latest_persona || !chat.persona_snapshot) {
    return getDefaultPersona();
  }
  try {
    return JSON.parse(chat.persona_snapshot) as UserPersonaRow;
  } catch {
    return getDefaultPersona();
  }
}

/**
 * Menyusun system prompt + riwayat pesan LLM untuk sebuah giliran karakter,
 * dipakai bersama oleh alur kirim pesan baru dan alur regenerate/swipe.
 */
function buildTurnContext(params: {
  chat: ChatRow;
  character: CharacterRow;
  historyMessages: MessageRow[];
  isAlternativeVariation?: boolean;
}) {
  const { chat, character, historyMessages, isAlternativeVariation } = params;
  const db = getDb();
  const settings = getSettingsMap();

  const historyLimit = Math.max(4, parseInt(settings.history_limit || '20', 10) || 20);
  const slicedHistory = historyMessages.slice(-historyLimit);

  const recentText = slicedHistory.map((m) => m.content).join('\n');
  const lore = getRelevantLore(character.world_id, recentText);
  const persona = resolveChatPersona(chat);

  const memories = (db
    .prepare('SELECT * FROM memories WHERE character_id = ? OR character_id IS NULL ORDER BY created_at DESC LIMIT 25')
    .all(character.id) as unknown) as MemoryRow[];

  let systemPrompt = buildCharacterSystemPrompt({
    character,
    persona,
    memories,
    lore,
    chatSummary: chat.summary,
    replyStyle: (chat.reply_style as any) || 'sedang',
  });

  if (isAlternativeVariation) {
    systemPrompt += `\n\nCATATAN VARIASI: Berikan sudut pandang respons, ekspresi, atau kelanjutan kalimat yang berbeda dari jawaban sebelumnya, namun tetap 100% konsisten dengan kepribadian ${character.name}.`;
  }

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...slicedHistory.map((m) => ({
      role: (m.role === 'character' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const baseTemp =
    chat.temperature ??
    character.temperature_override ??
    (parseFloat(settings.temperature || '0.9') || 0.9);

  const effectiveTemp = isAlternativeVariation ? Math.min(1.15, baseTemp + 0.08) : baseTemp;
  const maxTokens = chat.max_tokens ?? (parseInt(settings.max_tokens || '1024', 10) || 1024);

  return { llmMessages, temperature: effectiveTemp, maxTokens };
}

export async function POST(req: NextRequest) {
  const db = getDb();
  let userMessageRow: MessageRow | null = null;
  let charMessageId: string | null = null;
  let isRegenerate = false;

  try {
    const body = await req.json();
    const action = String(body.action || 'send');
    isRegenerate = action === 'regenerate' || action === 'swipe_generate';

    let chat: ChatRow | undefined;
    let character: CharacterRow | undefined;
    let llmMessages: LLMMessage[];
    let effectiveTemperature: number | undefined;
    let existingAlternatives: string[] = [];

    if (isRegenerate) {
      // Alur Regenerate / Buat Alternatif Swipe Baru (streaming)
      const messageId = String(body.messageId || '');
      const msg = (db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown) as
        | MessageRow
        | undefined;
      if (!msg || msg.role !== 'character') {
        return NextResponse.json({ error: 'Pesan karakter tidak ditemukan.' }, { status: 404 });
      }

      chat = (db.prepare('SELECT * FROM chats WHERE id = ?').get(msg.chat_id) as unknown) as
        | ChatRow
        | undefined;
      if (!chat) {
        return NextResponse.json({ error: 'Ruang chat tidak ditemukan.' }, { status: 404 });
      }

      character = (db.prepare('SELECT * FROM characters WHERE id = ?').get(chat.character_id) as unknown) as
        | CharacterRow
        | undefined;
      if (!character) {
        return NextResponse.json({ error: 'Karakter tidak ditemukan.' }, { status: 404 });
      }

      const allMsgs = (db
        .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
        .all(chat.id) as unknown) as MessageRow[];

      const msgIdx = allMsgs.findIndex((m) => m.id === messageId);
      const historyBefore = msgIdx > 0 ? allMsgs.slice(0, msgIdx) : [];

      try {
        existingAlternatives = JSON.parse(msg.alternatives || '[]');
      } catch {
        existingAlternatives = [msg.content];
      }
      if (existingAlternatives.length === 0) existingAlternatives = [msg.content];

      const ctx = buildTurnContext({
        chat,
        character,
        historyMessages: historyBefore,
        isAlternativeVariation: true,
      });
      llmMessages = ctx.llmMessages;
      effectiveTemperature = ctx.temperature;
      charMessageId = messageId;
    } else {
      // Alur Kirim Pesan Baru / Lanjutkan Narasi
      const chatId = String(body.chatId || '');
      const userText = body.content !== undefined ? String(body.content) : '';

      chat = (db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as unknown) as
        | ChatRow
        | undefined;
      if (!chat) {
        return NextResponse.json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
      }

      character = (db.prepare('SELECT * FROM characters WHERE id = ?').get(chat.character_id) as unknown) as
        | CharacterRow
        | undefined;
      if (!character) {
        return NextResponse.json({ error: 'Karakter tidak ditemukan.' }, { status: 404 });
      }

      const trimmedInput = userText.trim();
      if (action === 'send' && trimmedInput) {
        const uId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO messages (id, chat_id, role, content, is_pinned_memory, alternatives, created_at)
           VALUES (?, ?, 'user', ?, 0, ?, ?)`
        ).run(uId, chat.id, userText, JSON.stringify([userText]), now);
        userMessageRow = (db.prepare('SELECT * FROM messages WHERE id = ?').get(uId) as unknown) as MessageRow;
      }

      const pastMessages = (db
        .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
        .all(chat.id) as unknown) as MessageRow[];

      const ctx = buildTurnContext({ chat, character, historyMessages: pastMessages });
      llmMessages = ctx.llmMessages;
      effectiveTemperature = ctx.temperature;

      charMessageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const nowTime = new Date().toISOString();
      db.prepare(
        `INSERT INTO messages (id, chat_id, role, content, is_pinned_memory, alternatives, created_at)
         VALUES (?, ?, 'character', '', 0, '[]', ?)`
      ).run(charMessageId, chat.id, nowTime);
    }

    const finalChat = chat;
    const finalCharacter = character;
    const finalCharMessageId = charMessageId as string;

    // Buka ReadableStream SSE
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let rawAccumulated = '';

        try {
          // Kirim ID pesan dan data pesan pengguna di awal
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'start',
                characterMessageId: finalCharMessageId,
                isRegenerate,
                userMessage: userMessageRow ? formatMessageRow(userMessageRow) : null,
              })}\n\n`
            )
          );

          // Panggil streaming LLM
          const gen = streamLLMResponse(llmMessages, {
            characterId: finalCharacter.id,
            chatId: finalChat.id,
            actionType: 'chat',
            temperature: finalCharacter.temperature_override ?? effectiveTemperature,
          });

          for await (const chunk of gen) {
            rawAccumulated += chunk;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'chunk',
                  text: chunk,
                })}\n\n`
              )
            );
          }

          // Setelah stream selesai, bersihkan glitch / tag internal / perulangan karakter
          const cleanedText = cleanCharacterOutput(rawAccumulated, finalCharacter.name);
          const finalContent = cleanedText || rawAccumulated.trim() || '...';

          const finishTime = new Date().toISOString();

          if (isRegenerate) {
            const updatedAlternatives = [...existingAlternatives, finalContent];
            const newIndex = updatedAlternatives.length - 1;
            db.prepare('UPDATE messages SET content = ?, alternatives = ?, active_alt_index = ? WHERE id = ?').run(
              finalContent,
              JSON.stringify(updatedAlternatives),
              newIndex,
              finalCharMessageId
            );
          } else {
            db.prepare('UPDATE messages SET content = ?, alternatives = ? WHERE id = ?').run(
              finalContent,
              JSON.stringify([finalContent]),
              finalCharMessageId
            );
          }
          db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(finishTime, finalChat.id);

          const finalRow = (db.prepare('SELECT * FROM messages WHERE id = ?').get(finalCharMessageId) as unknown) as MessageRow;

          // Periksa apakah perlu auto-title (hanya pada alur kirim pesan baru, bukan regenerate)
          let newTitle: string | null = null;
          if (!isRegenerate) {
            const allMsgs = (db
              .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
              .all(finalChat.id) as unknown) as MessageRow[];

            const isDefaultTitle =
              !finalChat.title ||
              finalChat.title.startsWith('Percakapan dengan ') ||
              finalChat.title.startsWith('Chat dengan ') ||
              finalChat.title === 'Percakapan Baru';

            if (isDefaultTitle && allMsgs.length >= 2 && allMsgs.length <= 4) {
              try {
                const earlyTranscript = allMsgs
                  .slice(0, 4)
                  .map((m) => `${m.role === 'character' ? finalCharacter.name : 'Pengguna'}: ${m.content.slice(0, 160)}`)
                  .join('\n');

                const titleRes = await generateLLMResponse(
                  [
                    {
                      role: 'system',
                      content:
                        'Buatlah satu judul topik percakapan yang padat, menarik, dan spesifik (maksimal 3-5 kata, Bahasa Indonesia, tanpa tanda kutip atau titik) berdasarkan awal dialog berikut:',
                    },
                    { role: 'user', content: earlyTranscript },
                  ],
                  {
                    temperature: 0.3,
                    maxTokens: 40,
                    characterId: finalCharacter.id,
                    chatId: finalChat.id,
                    actionType: 'title',
                  }
                );

                let cleanTitleCandidate = (titleRes.text || '')
                  .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
                  .replace(/^(Judul|Topic|Topik)\s*:\s*/i, '')
                  .trim();

                if (cleanTitleCandidate.length > 3 && cleanTitleCandidate.length <= 50) {
                  db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(cleanTitleCandidate, finalChat.id);
                  newTitle = cleanTitleCandidate;
                }
              } catch {}
            }
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                message: formatMessageRow(finalRow),
                title: newTitle,
              })}\n\n`
            )
          );
          controller.close();
        } catch (streamErr: any) {
          const isAbort = streamErr.name === 'AbortError' || req.signal.aborted;

          if (rawAccumulated.trim()) {
            const cleaned = cleanCharacterOutput(rawAccumulated, finalCharacter.name) || rawAccumulated.trim();

            if (isRegenerate) {
              const updatedAlternatives = [...existingAlternatives, cleaned];
              const newIndex = updatedAlternatives.length - 1;
              db.prepare('UPDATE messages SET content = ?, alternatives = ?, active_alt_index = ? WHERE id = ?').run(
                cleaned,
                JSON.stringify(updatedAlternatives),
                newIndex,
                finalCharMessageId
              );
            } else {
              db.prepare('UPDATE messages SET content = ?, alternatives = ? WHERE id = ?').run(
                cleaned,
                JSON.stringify([cleaned]),
                finalCharMessageId
              );
            }

            const savedRow = (db.prepare('SELECT * FROM messages WHERE id = ?').get(finalCharMessageId) as unknown) as MessageRow;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'stopped',
                  message: formatMessageRow(savedRow),
                })}\n\n`
              )
            );
          } else {
            if (!isRegenerate) {
              db.prepare('DELETE FROM messages WHERE id = ?').run(finalCharMessageId);
            }
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  error: isAbort ? 'Balasan dihentikan.' : streamErr.message || 'Gagal streaming balasan.',
                })}\n\n`
              )
            );
          }
          controller.close();
        }
      },
      cancel() {
        if (charMessageId && !isRegenerate) {
          const row = (db.prepare('SELECT * FROM messages WHERE id = ?').get(charMessageId) as unknown) as
            | MessageRow
            | undefined;
          if (row && !row.content.trim()) {
            db.prepare('DELETE FROM messages WHERE id = ?').run(charMessageId);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Mencegah proxy (nginx/Cloudflare) menahan/mem-buffer chunk sebelum dikirim ke klien
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    if (charMessageId && !isRegenerate) {
      db.prepare('DELETE FROM messages WHERE id = ?').run(charMessageId);
    }
    return NextResponse.json({ error: err.message || 'Gagal memproses permintaan chat.' }, { status: 500 });
  }
}
