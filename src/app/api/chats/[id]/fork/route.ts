import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ChatRow, MessageRow, query, queryOne, withTransaction } from '@/lib/db';
import { stripOwner } from '@/lib/format';
import { handleApiError, HttpError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { requireOwnedChat } from '@/lib/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Mencabangkan (fork) sebuah percakapan hingga pesan tertentu tanpa menghapus alur aslinya.
 */
export async function POST(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const body = await readJson(req).catch(() => ({}));
    const sourceChat = await requireOwnedChat(user.id, id);

    const targetMessageId = body.messageId ? String(body.messageId).trim() : null;
    const customTitle = body.title ? String(body.title).trim().slice(0, 120) : '';

    const result = await withTransaction(async (client) => {
      const allMsgs = await query<MessageRow>(
        'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
        [sourceChat.id],
        client
      );

      let sliceEnd = allMsgs.length;
      if (targetMessageId) {
        const idx = allMsgs.findIndex((m) => m.id === targetMessageId);
        if (idx < 0) throw new HttpError(404, 'Pesan titik cabang tidak ditemukan.');
        sliceEnd = idx + 1;
      }

      const toCopy = allMsgs.slice(0, sliceEnd);
      const copiedIds = new Set(toCopy.map((m) => m.id));
      const keepSummary = Boolean(
        sourceChat.summary &&
          (!sourceChat.summarized_until_msg_id || copiedIds.has(sourceChat.summarized_until_msg_id))
      );

      const baseTitle = sourceChat.title.replace(/\s*\(Cabang(?:\s*\d+)?\)\s*$/i, '').trim() || 'Percakapan';
      const newTitle = customTitle || `${baseTitle} (Cabang)`.slice(0, 120);
      const newChatId = newId('chat');

      const createdChat = await queryOne<ChatRow>(
        `INSERT INTO chats (
           id, user_id, character_id, character_snapshot, title, summary, summarized_until_msg_id,
           temperature, max_tokens, reply_style, persona_id, persona_snapshot, use_latest_persona
         )
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          newChatId,
          user.id,
          sourceChat.character_id,
          sourceChat.character_snapshot,
          newTitle,
          keepSummary ? sourceChat.summary : '',
          sourceChat.temperature,
          sourceChat.max_tokens,
          sourceChat.reply_style,
          sourceChat.persona_id,
          sourceChat.persona_snapshot,
          sourceChat.use_latest_persona,
        ],
        client
      );

      let newSummarizedUntilId: string | null = null;
      for (const msg of toCopy) {
        const clonedId = newId('msg');
        if (keepSummary && sourceChat.summarized_until_msg_id === msg.id) {
          newSummarizedUntilId = clonedId;
        }
        await client.query(
          `INSERT INTO messages (id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            clonedId,
            newChatId,
            msg.role,
            msg.content,
            msg.alternatives,
            msg.active_alt_index,
            msg.is_pinned_memory,
            msg.created_at,
          ]
        );
      }

      if (newSummarizedUntilId) {
        await client.query('UPDATE chats SET summarized_until_msg_id = $1 WHERE id = $2', [
          newSummarizedUntilId,
          newChatId,
        ]);
      }

      return { chat: createdChat!, copiedMessages: toCopy.length };
    });

    return NextResponse.json(
      { chat: stripOwner(result.chat), copiedMessages: result.copiedMessages },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err, 'Gagal mencabangkan percakapan.');
  }
}
