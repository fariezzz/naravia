import { NextRequest, NextResponse } from 'next/server';
import { buildCharacterSystemPrompt } from '@/lib/character';
import {
  CharacterRow,
  ChatRow,
  getDb,
  getDefaultPersona,
  getPersonaById,
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

export async function POST(req: NextRequest) {
  const db = getDb();
  let userMessageRow: MessageRow | null = null;
  let charMessageId: string | null = null;

  try {
    const body = await req.json();
    const chatId = String(body.chatId || '');
    const action = String(body.action || 'send');
    const userText = body.content !== undefined ? String(body.content) : '';

    const chat = (db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as unknown) as
      | ChatRow
      | undefined;
    if (!chat) {
      return NextResponse.json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
    }

    const character = (db.prepare('SELECT * FROM characters WHERE id = ?').get(chat.character_id) as unknown) as
      | CharacterRow
      | undefined;
    if (!character) {
      return NextResponse.json({ error: 'Karakter tidak ditemukan.' }, { status: 404 });
    }

    const personaRow = resolveChatPersona(chat);

    // Jika action === 'send' dan ada teks pengguna yang bukan hanya spasi kosong
    const trimmedInput = userText.trim();
    if (action === 'send' && trimmedInput) {
      const uId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO messages (id, chat_id, role, content, persona_name, persona_avatar, is_pinned_memory, alternatives, created_at, updated_at)
         VALUES (?, ?, 'user', ?, ?, ?, 0, ?, ?, ?)`
      ).run(
        uId,
        chat.id,
        userText,
        personaRow ? personaRow.display_name : null,
        personaRow ? personaRow.avatar : null,
        JSON.stringify([userText]),
        now,
        now
      );
      userMessageRow = (db.prepare('SELECT * FROM messages WHERE id = ?').get(uId) as unknown) as MessageRow;
    }

    // Persiapkan Riwayat & Prompt LLM
    const pastMessages = (db
      .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
      .all(chat.id) as unknown) as MessageRow[];

    const memories = (db
      .prepare('SELECT * FROM memories WHERE character_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(character.id) as unknown) as MemoryRow[];

    const recentContext = pastMessages.slice(-6).map((m) => m.content).join('\n');
    const lore = getRelevantLore(character.world_id, recentContext);

    const systemPrompt = buildCharacterSystemPrompt({
      character,
      persona: personaRow,
      memories,
      lore,
      replyStyle: (chat.reply_style as any) || 'sedang',
    });

    const llmMessages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...pastMessages.slice(-20).map((m) => ({
        role: (m.role === 'character' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Buat placeholder pesan karakter di DB
    charMessageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowTime = new Date().toISOString();
    db.prepare(
      `INSERT INTO messages (id, chat_id, role, content, is_pinned_memory, alternatives, created_at, updated_at)
       VALUES (?, ?, 'character', '', 0, '[]', ?, ?)`
    ).run(charMessageId, chat.id, nowTime, nowTime);

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
                characterMessageId: charMessageId,
                userMessage: userMessageRow ? formatMessageRow(userMessageRow) : null,
              })}\n\n`
            )
          );

          // Panggil streaming LLM
          const gen = streamLLMResponse(llmMessages, {
            characterId: character.id,
            chatId: chat.id,
            actionType: 'chat',
            temperature: character.temperature_override ?? undefined,
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
          const cleanedText = cleanCharacterOutput(rawAccumulated, character.name);
          const finalContent = cleanedText || rawAccumulated.trim() || '...';

          // Perbarui isi pesan karakter di DB dengan teks bersih
          const finishTime = new Date().toISOString();
          db.prepare('UPDATE messages SET content = ?, alternatives = ?, updated_at = ? WHERE id = ?').run(
            finalContent,
            JSON.stringify([finalContent]),
            finishTime,
            charMessageId
          );
          db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(finishTime, chat.id);

          const finalRow = (db.prepare('SELECT * FROM messages WHERE id = ?').get(charMessageId) as unknown) as MessageRow;

          // Periksa apakah perlu auto-title
          const allMsgs = (db
            .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
            .all(chat.id) as unknown) as MessageRow[];

          let newTitle: string | null = null;
          const isDefaultTitle =
            !chat.title ||
            chat.title.startsWith('Percakapan dengan ') ||
            chat.title.startsWith('Chat dengan ') ||
            chat.title === 'Percakapan Baru';

          if (isDefaultTitle && allMsgs.length >= 2 && allMsgs.length <= 4) {
            try {
              const earlyTranscript = allMsgs
                .slice(0, 4)
                .map((m) => `${m.role === 'character' ? character.name : 'Pengguna'}: ${m.content.slice(0, 160)}`)
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
                  characterId: character.id,
                  chatId: chat.id,
                  actionType: 'title',
                }
              );

              let cleanTitleCandidate = (titleRes.text || '')
                .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
                .replace(/^(Judul|Topic|Topik)\s*:\s*/i, '')
                .trim();

              if (cleanTitleCandidate.length > 3 && cleanTitleCandidate.length <= 50) {
                db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(cleanTitleCandidate, chat.id);
                newTitle = cleanTitleCandidate;
              }
            } catch {}
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
          const finishTime = new Date().toISOString();

          if (rawAccumulated.trim()) {
            const cleaned = cleanCharacterOutput(rawAccumulated, character.name) || rawAccumulated.trim();
            db.prepare('UPDATE messages SET content = ?, alternatives = ?, updated_at = ? WHERE id = ?').run(
              cleaned,
              JSON.stringify([cleaned]),
              finishTime,
              charMessageId
            );
            const savedRow = (db.prepare('SELECT * FROM messages WHERE id = ?').get(charMessageId) as unknown) as MessageRow;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'stopped',
                  message: formatMessageRow(savedRow),
                })}\n\n`
              )
            );
          } else {
            db.prepare('DELETE FROM messages WHERE id = ?').run(charMessageId);
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
        if (charMessageId) {
          const row = (db.prepare('SELECT * FROM messages WHERE id = ?').get(charMessageId) as unknown) as MessageRow | undefined;
          if (row && !row.content.trim()) {
            db.prepare('DELETE FROM messages WHERE id = ?').run(charMessageId);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    if (charMessageId) {
      db.prepare('DELETE FROM messages WHERE id = ?').run(charMessageId);
    }
    return NextResponse.json({ error: err.message || 'Gagal memproses permintaan chat.' }, { status: 500 });
  }
}
