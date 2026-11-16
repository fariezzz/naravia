import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildTurnContext, maybeAutoTitle, runBackgroundMemoryTasks } from '@/lib/chatTurn';
import { CharacterRow, ChatRow, execute, MessageRow, nowIso, query, queryOne, withTransaction } from '@/lib/db';
import { formatMessageRow, parseJsonSafe, stripOwner } from '@/lib/format';
import { handleApiError, HttpError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { cleanCharacterOutput, generateLLMResponse } from '@/lib/llm';
import { enforceLlmRateLimit } from '@/lib/rateLimit';
import { requireLiveChatCharacter, requireOwnedChat, requireOwnedMessage } from '@/lib/store';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 20000;

async function generateCharacterText(
  userId: string,
  chat: ChatRow,
  character: CharacterRow,
  history: MessageRow[],
  opts: { isAlternativeVariation?: boolean; isContinuation?: boolean; isOpeningLine?: boolean }
) {
  const ctx = await buildTurnContext({ userId, chat, character, historyMessages: history, ...opts });
  const callOpts = {
    userId,
    temperature: ctx.temperature,
    maxTokens: ctx.maxTokens,
    characterId: character.id,
    chatId: chat.id,
    actionType: 'chat' as const,
  };

  const res = await generateLLMResponse(ctx.llmMessages, callOpts);
  let cleaned = cleanCharacterOutput(res.text, character.name);
  if (!cleaned) {
    // Satu kali percobaan ulang jika output hanya berisi tag teknis yang tersaring habis
    const retry = await generateLLMResponse(ctx.llmMessages, {
      ...callOpts,
      temperature: Math.min(1.0, ctx.temperature + 0.05),
    });
    cleaned = cleanCharacterOutput(retry.text, character.name);
  }
  if (!cleaned) {
    throw new Error('Model menghasilkan respons teknis kosong. Silakan coba kirim atau generate ulang.');
  }
  return { text: cleaned, matchedLore: ctx.matchedLore };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const action = String(body.action || 'send');

    // 1. Pilih alternatif swipe yang sudah ada (tanpa memanggil LLM)
    if (action === 'swipe_select') {
      const msg = await requireOwnedMessage(user.id, String(body.messageId || ''));
      const alternatives = parseJsonSafe<string[]>(msg.alternatives, [msg.content]);
      const clampedIndex = Math.max(0, Math.min(alternatives.length - 1, Number(body.index ?? 0)));
      const newContent = alternatives[clampedIndex] || msg.content;

      const updated = await queryOne<MessageRow>(
        'UPDATE messages SET content = $1, active_alt_index = $2 WHERE id = $3 RETURNING *',
        [newContent, clampedIndex, msg.id]
      );
      return NextResponse.json({ message: formatMessageRow(updated!) });
    }

    // 2. Buat alternatif swipe baru / regenerate (jalur non-streaming)
    if (action === 'swipe_generate' || action === 'regenerate') {
      enforceLlmRateLimit(user.id);
      const msg = await requireOwnedMessage(user.id, String(body.messageId || ''));
      if (msg.role !== 'character') return jsonError('Pesan karakter tidak ditemukan.', 404);

      const chat = await requireOwnedChat(user.id, msg.chat_id);
      // Memakai definisi karakter yang dibekukan saat percakapan dibuat;
      // karakter yang sudah dihapus menolak pembuatan pesan baru (410)
      const character = await requireLiveChatCharacter(chat);
      const allMsgs = await query<MessageRow>(
        'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
        [chat.id]
      );
      const msgIdx = allMsgs.findIndex((m) => m.id === msg.id);
      const historyBefore = msgIdx > 0 ? allMsgs.slice(0, msgIdx) : [];

      const turn = await generateCharacterText(user.id, chat, character, historyBefore, {
        isAlternativeVariation: true,
        // Mengulang pesan pertama berarti tidak ada riwayat sebelumnya
        isOpeningLine: historyBefore.length === 0,
      });

      let alternatives = parseJsonSafe<string[]>(msg.alternatives, [msg.content]);
      if (alternatives.length === 0) alternatives = [msg.content];
      alternatives.push(turn.text);

      const updated = await queryOne<MessageRow>(
        'UPDATE messages SET content = $1, alternatives = $2, active_alt_index = $3 WHERE id = $4 RETURNING *',
        [turn.text, JSON.stringify(alternatives), alternatives.length - 1, msg.id]
      );
      await execute('UPDATE chats SET updated_at = now() WHERE id = $1', [chat.id]);

      return NextResponse.json({ message: formatMessageRow(updated!), matchedLore: turn.matchedLore });
    }

    // 3. Edit isi pesan
    if (action === 'edit') {
      const content = String(body.content || '').trim();
      if (!content) return jsonError('Isi pesan tidak boleh kosong.', 400);
      if (content.length > MAX_MESSAGE_LENGTH) return jsonError('Pesan terlalu panjang.', 400);

      const msg = await requireOwnedMessage(user.id, String(body.messageId || ''));
      const alternatives = parseJsonSafe<string[]>(msg.alternatives, [msg.content]);
      if (alternatives.length === 0) alternatives.push(content);
      else alternatives[msg.active_alt_index] = content;

      const updated = await queryOne<MessageRow>(
        'UPDATE messages SET content = $1, alternatives = $2 WHERE id = $3 RETURNING *',
        [content, JSON.stringify(alternatives), msg.id]
      );
      return NextResponse.json({ message: formatMessageRow(updated!) });
    }

    // 4. Hapus satu pesan
    if (action === 'delete') {
      const msg = await requireOwnedMessage(user.id, String(body.messageId || ''));
      await execute('DELETE FROM messages WHERE id = $1', [msg.id]);
      return NextResponse.json({ success: true });
    }

    // 5. Mundur (rewind): hapus pesan terpilih beserta seluruh pesan sesudahnya,
    //    termasuk memori yang bersumber dari pesan-pesan itu.
    if (action === 'rewind') {
      const messageId = String(body.messageId || '').trim();
      if (!messageId) return jsonError('ID pesan wajib diisi.', 400);

      // Satu transaksi agar pesan, memori, dan ringkasan tidak pernah
      // tertinggal dalam keadaan setengah terhapus
      const result = await withTransaction(async (client) => {
        const msg = await requireOwnedMessage(user.id, messageId, client);
        const chat = await requireOwnedChat(user.id, msg.chat_id, client);

        // Urutan sama dengan yang dipakai saat menampilkan riwayat; id dipakai
        // sebagai pemecah seri agar titik potongnya selalu sama
        const ordered = await query<{ id: string }>(
          'SELECT id FROM messages WHERE chat_id = $1 ORDER BY created_at ASC, id ASC',
          [chat.id],
          client
        );
        const cutIndex = ordered.findIndex((m) => m.id === msg.id);
        if (cutIndex < 0) throw new HttpError(404, 'Pesan tidak ditemukan.');

        // Varian swipe tersimpan di kolom alternatives pada baris pesan itu sendiri,
        // jadi menghapus barisnya sekaligus menghapus seluruh variannya
        const doomedIds = ordered.slice(cutIndex).map((m) => m.id);

        // Memori manual lewat "Ingat Ini" dan memori otomatis sama-sama menyimpan
        // source_message_id, jadi keduanya bisa dilacak dari pesan yang dihapus.
        // Memori yang titik sumbernya masih tersisa tidak disentuh.
        const removedMemories = await query<{ id: string }>(
          `DELETE FROM memories
           WHERE user_id = $1 AND source_message_id = ANY($2::text[])
           RETURNING id`,
          [user.id, doomedIds],
          client
        );

        await execute('DELETE FROM messages WHERE chat_id = $1 AND id = ANY($2::text[])', [chat.id, doomedIds], client);

        // Ringkasan yang titik acuannya ikut terhapus sudah tidak sahih lagi.
        // Dikosongkan supaya dibuat ulang oleh mekanisme yang sudah ada,
        // bukan ditambal agar tidak menceritakan kejadian yang sudah dihapus.
        const acuanTerhapus = Boolean(
          chat.summarized_until_msg_id && doomedIds.includes(chat.summarized_until_msg_id)
        );
        // Ringkasan tanpa titik acuan tidak bisa dilacak cakupannya, jadi tidak dipertahankan
        const acuanTidakTerlacak = !chat.summarized_until_msg_id && Boolean((chat.summary || '').trim());
        const summaryCleared = acuanTerhapus || acuanTidakTerlacak;

        if (summaryCleared) {
          await execute(
            `UPDATE chats SET summary = '', summarized_until_msg_id = NULL, updated_at = now()
             WHERE id = $1 AND user_id = $2`,
            [chat.id, user.id],
            client
          );
        } else {
          await execute('UPDATE chats SET updated_at = now() WHERE id = $1', [chat.id], client);
        }

        const updatedChat = await queryOne<ChatRow>('SELECT * FROM chats WHERE id = $1', [chat.id], client);
        return {
          deletedMessageIds: doomedIds,
          deletedMemoryIds: removedMemories.map((m) => m.id),
          summaryCleared,
          chat: updatedChat ? stripOwner(updatedChat) : null,
        };
      });

      return NextResponse.json({
        success: true,
        ...result,
        deletedCount: result.deletedMessageIds.length,
      });
    }

    // 6. Kirim pesan baru (jalur non-streaming, cadangan bila streaming tidak dipakai)
    enforceLlmRateLimit(user.id);
    const chatId = String(body.chatId || '').trim();
    const content = String(body.content || '').trim();
    const isContinue = Boolean(body.isContinue || !content);
    if (!chatId) return jsonError('ID percakapan wajib diisi.', 400);
    if (content.length > MAX_MESSAGE_LENGTH) return jsonError('Pesan terlalu panjang.', 400);

    const chat = await requireOwnedChat(user.id, chatId);
    // Karakter terhapus memicu 410 agar percakapan lama tetap bisa dibaca tanpa pesan baru
    const character = await requireLiveChatCharacter(chat);

    let userMessageRow: MessageRow | null = null;
    if (content) {
      userMessageRow = await queryOne<MessageRow>(
        `INSERT INTO messages (id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory, created_at)
         VALUES ($1, $2, 'user', $3, $4, 0, 0, $5) RETURNING *`,
        [newId('msg'), chatId, content, JSON.stringify([content]), nowIso()]
      );
    }

    const allMessages = await query<MessageRow>(
      'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
      [chatId]
    );
    if (allMessages.length === 0) {
      return jsonError('Belum ada riwayat percakapan. Tuliskan pesan awal untuk memulai percakapan.', 400);
    }

    let turn;
    try {
      turn = await generateCharacterText(user.id, chat, character, allMessages, { isContinuation: isContinue });
    } catch (llmErr) {
      // Batalkan pesan pengguna agar tidak menggantung tanpa balasan
      if (userMessageRow) await execute('DELETE FROM messages WHERE id = $1', [userMessageRow.id]);
      throw llmErr;
    }

    const charMessage = await queryOne<MessageRow>(
      `INSERT INTO messages (id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory, created_at)
       VALUES ($1, $2, 'character', $3, $4, 0, 0, $5) RETURNING *`,
      [newId('msg'), chatId, turn.text, JSON.stringify([turn.text]), nowIso(5)]
    );
    await execute('UPDATE chats SET updated_at = now() WHERE id = $1', [chatId]);

    const updatedMessages = [...allMessages, charMessage!];
    await runBackgroundMemoryTasks(user.id, chat, character, updatedMessages);
    await maybeAutoTitle(user.id, chat, character, updatedMessages);

    const updatedChat = await queryOne<ChatRow>('SELECT * FROM chats WHERE id = $1', [chatId]);
    const updatedMemories = await query(
      `SELECT * FROM memories WHERE user_id = $2 AND (character_id = $1 OR character_id IS NULL)
       ORDER BY created_at DESC`,
      [character.id, user.id]
    );

    return NextResponse.json({
      userMessage: userMessageRow ? formatMessageRow(userMessageRow) : null,
      characterMessage: formatMessageRow(charMessage!),
      matchedLore: turn.matchedLore,
      chat: updatedChat ? stripOwner(updatedChat) : null,
      memories: updatedMemories.map(stripOwner),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memproses pesan.', 400);
  }
}
