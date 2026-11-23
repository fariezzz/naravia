import { buildCharacterSystemPrompt } from './character';
import { CharacterRow, ChatRow, execute, MessageRow, queryOne } from './db';
import { newId } from './ids';
import { generateLLMResponse, LLMMessage } from './llm';
import { getRelevantLore } from './lore';
import { getRelevantMemories, saveMemoryEmbedding } from './memories';
import { getUserSettings, resolveChatPersona } from './store';

// Menyusun system prompt + riwayat pesan untuk satu giliran karakter (dipakai jalur stream dan non-stream)
export async function buildTurnContext(params: {
  userId: string;
  chat: ChatRow;
  character: CharacterRow;
  historyMessages: MessageRow[];
  isAlternativeVariation?: boolean;
  isContinuation?: boolean;
  // Pesan pembuka: tidak ada riwayat sebelumnya yang bisa dipakai sebagai konteks
  isOpeningLine?: boolean;
}) {
  const { userId, chat, character, historyMessages, isAlternativeVariation, isContinuation, isOpeningLine } = params;
  const settings = await getUserSettings(userId);

  const historyLimit = Math.max(4, parseInt(settings.history_limit || '20', 10) || 20);
  const slicedHistory = historyMessages.slice(-historyLimit);

  const recentText = slicedHistory.map((m) => m.content).join('\n');
  const [lore, persona, memoryResult] = await Promise.all([
    getRelevantLore(userId, character.world_id, recentText, {
      allowPublicWorld: character.visibility === 'public',
    }),
    resolveChatPersona(userId, chat),
    getRelevantMemories({
      userId,
      characterId: character.id,
      recentText,
      limit: 25,
    }),
  ]);
  const memories = memoryResult.memories;

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
  if (isOpeningLine) {
    systemPrompt += `\n\nCATATAN PEMBUKA: Ini adalah kalimat pembuka percakapan. Belum ada ucapan dari pengguna. Tulis LANGSUNG sebagai ${character.name} yang membuka percakapan, berupa narasi tindakan dan dialog. JANGAN menulis transkrip percakapan, JANGAN menulis label peran seperti "${character.name}:" atau nama pengguna diikuti titik dua, JANGAN mengarang ucapan pengguna, dan JANGAN menulis kalimat tentang proses atau lampiran.`;
  }
  if (isContinuation) {
    systemPrompt += `\n\nCATATAN KELANJUTAN: Pengguna diam atau memberikan jeda bagi ${character.name} untuk melanjutkan ucapan, tindakan, atau peristiwa selanjutnya. Lanjutkan narasi atau dialog secara mengalir dan alami dari situasi terakhir tanpa mengulang kalimat sebelumnya.`;
  }

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...slicedHistory.map((m) => ({
      role: (m.role === 'character' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  // Beberapa provider mewajibkan pesan terakhir dari 'user'
  if (isContinuation && llmMessages.length > 1 && llmMessages[llmMessages.length - 1].role === 'assistant') {
    llmMessages.push({
      role: 'user',
      content: `(Lanjutkan secara alami apa yang sedang ${character.name} bicarakan, lakukan, atau reaksi selanjutnya)`,
    });
  }

  // Tanpa satu pun pesan pengguna, banyak model mengisi kekosongan dengan
  // mengarang transkrip percakapan lengkap. Pemicu eksplisit mencegahnya.
  if (llmMessages.length === 1) {
    llmMessages.push({
      role: 'user',
      content: `(Tulis kalimat pembuka ${character.name} untuk memulai percakapan ini, hanya ucapan dan tindakan ${character.name} sendiri)`,
    });
  }

  const baseTemp =
    chat.temperature ?? character.temperature_override ?? (parseFloat(settings.temperature || '0.9') || 0.9);
  const temperature = isAlternativeVariation ? Math.min(1.15, baseTemp + 0.08) : baseTemp;
  const maxTokens = chat.max_tokens ?? (parseInt(settings.max_tokens || '1024', 10) || 1024);

  return {
    llmMessages,
    temperature,
    maxTokens,
    matchedLore: lore.matchedEntries,
    selectedMemories: memories,
    memoryRetrievalMode: memoryResult.mode,
  };
}

export function isDefaultChatTitle(title: string | null | undefined): boolean {
  return (
    !title ||
    title.startsWith('Percakapan dengan ') ||
    title.startsWith('Chat dengan ') ||
    title === 'Percakapan Baru'
  );
}

// Judul otomatis dari 2-4 pesan pertama, hanya jika judul masih bawaan
export async function maybeAutoTitle(
  userId: string,
  chat: ChatRow,
  character: CharacterRow,
  allMessages: MessageRow[]
): Promise<string | null> {
  if (!isDefaultChatTitle(chat.title) || allMessages.length < 2 || allMessages.length > 4) return null;
  try {
    const earlyTranscript = allMessages
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
      { userId, temperature: 0.3, maxTokens: 40, characterId: character.id, chatId: chat.id, actionType: 'title' }
    );

    const cleanTitle = (titleRes.text || '')
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .replace(/^(Judul|Topic|Topik)\s*:\s*/i, '')
      .trim();

    if (cleanTitle.length > 3 && cleanTitle.length <= 50) {
      await execute('UPDATE chats SET title = $1 WHERE id = $2 AND user_id = $3', [cleanTitle, chat.id, userId]);
      return cleanTitle;
    }
  } catch {
    // Kegagalan penamaan otomatis tidak boleh memutus alur chat
  }
  return null;
}

// Ringkasan otomatis berkala dan ekstraksi memori jangka panjang
export async function runBackgroundMemoryTasks(
  userId: string,
  chat: ChatRow,
  character: CharacterRow,
  allMessages: MessageRow[]
): Promise<void> {
  const settings = await getUserSettings(userId);

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
        { userId, temperature: 0.3, maxTokens: 400, characterId: character.id, chatId: chat.id, actionType: 'summary' }
      );

      if (sumRes.text) {
        await execute(
          'UPDATE chats SET summary = $1, summarized_until_msg_id = $2 WHERE id = $3 AND user_id = $4',
          [sumRes.text, olderMessages[olderMessages.length - 1]?.id || null, chat.id, userId]
        );
      }
    } catch {
      // Abaikan agar alur chat utama tidak terputus
    }
  }

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
          userId,
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
          for (const f of parsed.facts.slice(0, 2)) {
            const content = String(f?.content || '').trim();
            if (content.length <= 8) continue;
            const dup = await queryOne(
              'SELECT id FROM memories WHERE user_id = $1 AND character_id = $2 AND content = $3',
              [userId, character.id, content]
            );
            if (dup) continue;
            const memId = newId('mem');
            await execute(
              `INSERT INTO memories (id, user_id, character_id, type, content, source_chat_id, source_message_id, is_auto)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
              [
                memId,
                userId,
                character.id,
                f?.type === 'preference' ? 'preference' : 'fact',
                content,
                chat.id,
                recentWindow[recentWindow.length - 1]?.id || null,
              ]
            );
            saveMemoryEmbedding(memId, content).catch(() => undefined);
          }
        }
      }
    } catch {
      // Abaikan kegagalan ekstraksi latar belakang
    }
  }
}
