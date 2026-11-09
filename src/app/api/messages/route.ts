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
import { cleanCharacterOutput, generateLLMResponse, LLMMessage } from '@/lib/llm';
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

async function generateCharacterTurn(params: {
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

  let sysPrompt = buildCharacterSystemPrompt({
    character,
    persona,
    memories,
    lore,
    chatSummary: chat.summary,
    replyStyle: chat.reply_style || 'sedang',
  });

  if (isAlternativeVariation) {
    sysPrompt += `\n\nCATATAN VARIASI: Berikan sudut pandang respons, ekspresi, atau kelanjutan kalimat yang berbeda dari jawaban sebelumnya, namun tetap 100% konsisten dengan kepribadian ${character.name}.`;
  }

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: sysPrompt },
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

  const res = await generateLLMResponse(llmMessages, {
    temperature: effectiveTemp,
    maxTokens,
    characterId: character.id,
    chatId: chat.id,
    actionType: 'chat',
  });

  return {
    text: cleanCharacterOutput(res.text, character.name),
    matchedLore: lore.matchedEntries,
    modelUsed: res.modelUsed,
  };
}

/**
 * Fase 2: Ringkasan otomatis jika jumlah pesan melebihi ambang dan Ekstraksi Memori Otomatis
 */
async function runPhase2BackgroundTasks(chat: ChatRow, character: CharacterRow, allMessages: MessageRow[]) {
  const db = getDb();
  const settings = getSettingsMap();

  const threshold = Math.max(16, parseInt(settings.auto_summarize_threshold || '30', 10) || 30);
  if (allMessages.length >= threshold && allMessages.length % 10 === 0) {
    try {
      const olderMessages = allMessages.slice(0, -10);
      const transcript = olderMessages
        .slice(-20)
        .map((m) => `${m.role === 'character' ? character.name : 'Pengguna'}: ${m.content}`)
        .join('\n\n');

      const sumRes = await generateLLMResponse(
        [
          {
            role: 'system',
            content:
              'Perbarui ringkasan percakapan berikut secara padat dalam Bahasa Indonesia (maksimal 5 kalimat). Gabungkan ringkasan lama (jika ada) dengan peristiwa terbaru.',
          },
          {
            role: 'user',
            content: `${chat.summary ? `RINGKASAN LAMA:\n${chat.summary}\n\n` : ''}PERCAKAPAN TERBARU:\n${transcript}`,
          },
        ],
        {
          temperature: 0.3,
          maxTokens: 400,
          characterId: character.id,
          chatId: chat.id,
          actionType: 'summary',
        }
      );

      if (sumRes.text) {
        db.prepare('UPDATE chats SET summary = ?, summarized_until_msg_id = ? WHERE id = ?').run(
          sumRes.text,
          olderMessages[olderMessages.length - 1]?.id || null,
          chat.id
        );
      }
    } catch {
      // Abaikan jika ringkasan latar belakang gagal agar tidak memutus alur chat utama
    }
  }

  // Ekstraksi memori jangka panjang otomatis setiap 6 pesan
  if (settings.auto_extract_memory === 'true' && allMessages.length >= 6 && allMessages.length % 6 === 0) {
    try {
      const recentWindow = allMessages.slice(-6);
      const snippet = recentWindow
        .map((m) => `${m.role === 'character' ? character.name : 'Pengguna'}: ${m.content}`)
        .join('\n');

      const memRes = await generateLLMResponse(
        [
          {
            role: 'system',
            content: `Analisis cuplikan percakapan ini. Jika ada fakta baru yang penting tentang Pengguna atau peristiwa penting dengan ${character.name} yang layak diingat untuk jangka panjang, kembalikan JSON: {"facts": [{"type": "fact" | "preference", "content": "Kalimat fakta singkat"}]}. Jika tidak ada fakta baru yang penting, kembalikan {"facts": []}.`,
          },
          { role: 'user', content: snippet },
        ],
        {
          temperature: 0.2,
          maxTokens: 300,
          characterId: character.id,
          chatId: chat.id,
          actionType: 'memory',
          jsonMode: true,
        }
      );

      const match = memRes.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.facts)) {
          const insertMem = db.prepare(`
            INSERT INTO memories (id, character_id, type, content, source_chat_id, source_message_id, is_auto, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
          `);
          for (const f of parsed.facts.slice(0, 2)) {
            const content = String(f?.content || '').trim();
            if (content.length > 8) {
              const dup = db
                .prepare('SELECT id FROM memories WHERE character_id = ? AND content = ?')
                .get(character.id, content);
              if (!dup) {
                insertMem.run(
                  `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  character.id,
                  f?.type === 'preference' ? 'preference' : 'fact',
                  content,
                  chat.id,
                  recentWindow[recentWindow.length - 1]?.id || null,
                  new Date().toISOString()
                );
              }
            }
          }
        }
      }
    } catch {
      // Abaikan kegagalan ekstraksi latar belakang
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || 'send');
    const db = getDb();

    // 1. Pilih alternatif swipe yang sudah ada (tanpa memanggil LLM)
    if (action === 'swipe_select') {
      const messageId = String(body.messageId || '');
      const targetIndex = Number(body.index ?? 0);
      const msg = (db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown) as MessageRow | undefined;
      if (!msg) {
        return NextResponse.json({ error: 'Pesan tidak ditemukan.' }, { status: 404 });
      }

      let alternatives: string[] = [];
      try {
        alternatives = JSON.parse(msg.alternatives || '[]');
      } catch {
        alternatives = [msg.content];
      }

      const clampedIndex = Math.max(0, Math.min(alternatives.length - 1, targetIndex));
      const newContent = alternatives[clampedIndex] || msg.content;

      db.prepare('UPDATE messages SET content = ?, active_alt_index = ? WHERE id = ?').run(
        newContent,
        clampedIndex,
        messageId
      );

      const updated = (db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown) as MessageRow;
      return NextResponse.json({ message: formatMessageRow(updated) });
    }

    // 2. Buat alternatif swipe baru / Regenerate balasan karakter
    if (action === 'swipe_generate' || action === 'regenerate') {
      const messageId = String(body.messageId || '');
      const msg = (db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown) as MessageRow | undefined;
      if (!msg || msg.role !== 'character') {
        return NextResponse.json({ error: 'Pesan karakter tidak ditemukan.' }, { status: 404 });
      }

      const chat = (db.prepare('SELECT * FROM chats WHERE id = ?').get(msg.chat_id) as unknown) as ChatRow | undefined;
      if (!chat) {
        return NextResponse.json({ error: 'Ruang chat tidak ditemukan.' }, { status: 404 });
      }

      const character = (db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(chat.character_id) as unknown) as CharacterRow | undefined;
      if (!character) {
        return NextResponse.json({ error: 'Karakter tidak ditemukan.' }, { status: 404 });
      }

      const allMsgs = (db
        .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
        .all(chat.id) as unknown) as MessageRow[];

      const msgIdx = allMsgs.findIndex((m) => m.id === messageId);
      const historyBefore = msgIdx > 0 ? allMsgs.slice(0, msgIdx) : [];

      const turn = await generateCharacterTurn({
        chat,
        character,
        historyMessages: historyBefore,
        isAlternativeVariation: true,
      });

      let alternatives: string[] = [];
      try {
        alternatives = JSON.parse(msg.alternatives || '[]');
      } catch {
        alternatives = [msg.content];
      }
      if (alternatives.length === 0) alternatives = [msg.content];

      alternatives.push(turn.text);
      const newIndex = alternatives.length - 1;

      db.prepare('UPDATE messages SET content = ?, alternatives = ?, active_alt_index = ? WHERE id = ?').run(
        turn.text,
        JSON.stringify(alternatives),
        newIndex,
        messageId
      );

      db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), chat.id);

      const updated = (db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown) as MessageRow;
      return NextResponse.json({
        message: formatMessageRow(updated),
        matchedLore: turn.matchedLore,
      });
    }

    // 3. Edit isi pesan (baik pesan pengguna maupun karakter)
    if (action === 'edit') {
      const messageId = String(body.messageId || '');
      const content = String(body.content || '').trim();
      if (!content) {
        return NextResponse.json({ error: 'Isi pesan tidak boleh kosong.' }, { status: 400 });
      }

      const msg = (db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown) as MessageRow | undefined;
      if (!msg) {
        return NextResponse.json({ error: 'Pesan tidak ditemukan.' }, { status: 404 });
      }

      let alternatives: string[] = [];
      try {
        alternatives = JSON.parse(msg.alternatives || '[]');
      } catch {
        alternatives = [msg.content];
      }
      if (alternatives.length === 0) alternatives = [content];
      else alternatives[msg.active_alt_index] = content;

      db.prepare('UPDATE messages SET content = ?, alternatives = ? WHERE id = ?').run(
        content,
        JSON.stringify(alternatives),
        messageId
      );

      const updated = (db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown) as MessageRow;
      return NextResponse.json({ message: formatMessageRow(updated) });
    }

    // 4. Hapus satu pesan
    if (action === 'delete') {
      const messageId = String(body.messageId || '');
      db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
      return NextResponse.json({ success: true });
    }

    // 5. Kirim pesan baru dari pengguna dan dapatkan balasan karakter
    const chatId = String(body.chatId || '').trim();
    const content = String(body.content || '').trim();
    if (!chatId || !content) {
      return NextResponse.json({ error: 'Pesan dan ID percakapan wajib diisi.' }, { status: 400 });
    }

    const chat = (db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as unknown) as ChatRow | undefined;
    if (!chat) {
      return NextResponse.json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
    }

    const character = (db
      .prepare('SELECT * FROM characters WHERE id = ?')
      .get(chat.character_id) as unknown) as CharacterRow | undefined;
    if (!character) {
      return NextResponse.json({ error: 'Karakter tidak ditemukan.' }, { status: 404 });
    }

    const userMsgTime = new Date().toISOString();
    const userMsgId = `msg-${Date.now()}-u`;

    db.prepare(`
      INSERT INTO messages (
        id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory, created_at
      ) VALUES (?, ?, 'user', ?, ?, 0, 0, ?)
    `).run(userMsgId, chatId, content, JSON.stringify([content]), userMsgTime);

    const allMessagesWithUser = (db
      .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
      .all(chatId) as unknown) as MessageRow[];

    let turn;
    try {
      turn = await generateCharacterTurn({
        chat,
        character,
        historyMessages: allMessagesWithUser,
      });
    } catch (llmErr) {
      // Jika panggilan LLM gagal, batalkan penyimpanan pesan user tadi supaya tidak menggantung dan kembalikan pesan error jujur
      db.prepare('DELETE FROM messages WHERE id = ?').run(userMsgId);
      throw llmErr;
    }

    const charMsgTime = new Date(Date.now() + 5).toISOString();
    const charMsgId = `msg-${Date.now()}-c`;

    db.prepare(`
      INSERT INTO messages (
        id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory, created_at
      ) VALUES (?, ?, 'character', ?, ?, 0, 0, ?)
    `).run(charMsgId, chatId, turn.text, JSON.stringify([turn.text]), charMsgTime);

    db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(charMsgTime, chatId);

    const userMessage = (db.prepare('SELECT * FROM messages WHERE id = ?').get(userMsgId) as unknown) as MessageRow;
    const charMessage = (db.prepare('SELECT * FROM messages WHERE id = ?').get(charMsgId) as unknown) as MessageRow;

    // Jalankan evaluasi ringkasan / ekstraksi memori otomatis Fase 2
    const updatedMessages = [...allMessagesWithUser, charMessage];
    await runPhase2BackgroundTasks(chat, character, updatedMessages);

    const updatedChat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
    const updatedMemories = db
      .prepare('SELECT * FROM memories WHERE character_id = ? OR character_id IS NULL ORDER BY created_at DESC')
      .all(character.id);

    return NextResponse.json({
      userMessage: formatMessageRow(userMessage),
      characterMessage: formatMessageRow(charMessage),
      matchedLore: turn.matchedLore,
      chat: updatedChat,
      memories: updatedMemories,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memproses pesan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
