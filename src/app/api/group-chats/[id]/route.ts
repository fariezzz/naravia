import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { execute, nowIso, query, queryOne } from '@/lib/db';
import { stripOwner } from '@/lib/format';
import {
  buildGroupTurnContext,
  GROUP_MESSAGES_SQL,
  GroupMessageRow,
  loadGroupMembers,
} from '@/lib/groupTurn';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { cleanCharacterOutput, generateLLMResponse } from '@/lib/llm';
import { enforceLlmRateLimit } from '@/lib/rateLimit';
import {
  formatPersona,
  getAllPersonas,
  getDefaultPersona,
  getPersonaById,
  requireOwnedGroupChat,
} from '@/lib/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const groupChat = await requireOwnedGroupChat(user.id, id);

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get('limit') || '60', 10);
    const limit = Number.isFinite(limitParam) ? Math.max(10, Math.min(200, limitParam)) : 60;
    const before = url.searchParams.get('before')?.trim() || '';
    const messagesOnly = url.searchParams.get('messagesOnly') === '1';

    const countRow = await queryOne<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM group_messages WHERE group_chat_id = $1',
      [id]
    );
    const totalMessages = Number(countRow?.cnt || 0);

    const fetchedDesc = before
      ? await query<GroupMessageRow>(
          `${GROUP_MESSAGES_SQL} WHERE gm.group_chat_id = $1 AND gm.created_at < $2 ORDER BY gm.created_at DESC LIMIT $3`,
          [id, before, limit + 1]
        )
      : await query<GroupMessageRow>(
          `${GROUP_MESSAGES_SQL} WHERE gm.group_chat_id = $1 ORDER BY gm.created_at DESC LIMIT $2`,
          [id, limit + 1]
        );

    const hasMoreMessages = fetchedDesc.length > limit;
    const messages = (hasMoreMessages ? fetchedDesc.slice(0, limit) : fetchedDesc).reverse();
    const oldestCursor = messages[0]?.created_at || null;

    if (messagesOnly) {
      return NextResponse.json({ messages, totalMessages, hasMoreMessages, oldestCursor });
    }

    const [members, personas] = await Promise.all([loadGroupMembers(id, user.id), getAllPersonas(user.id)]);
    const activePersona = groupChat.persona_id
      ? await getPersonaById(user.id, groupChat.persona_id)
      : await getDefaultPersona(user.id);

    return NextResponse.json({
      groupChat: { ...stripOwner(groupChat), persona_id: groupChat.persona_id || activePersona?.id || null },
      members: members.map(stripOwner),
      messages,
      totalMessages,
      hasMoreMessages,
      oldestCursor,
      activePersona: formatPersona(activePersona),
      personas: personas.map(formatPersona),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat ruang grup chat.');
  }
}

export async function POST(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    enforceLlmRateLimit(user.id);
    const { id } = await context.params;
    const body = await readJson(req);
    const groupChat = await requireOwnedGroupChat(user.id, id);

    const members = await loadGroupMembers(id, user.id);
    if (members.length === 0) return jsonError('Tidak ada anggota karakter di dalam grup ini.', 400);

    const userContent = String(body.content || '').trim();
    if (userContent.length > 20000) return jsonError('Pesan terlalu panjang.', 400);
    const forcedCharacterId = body.targetCharacterId ? String(body.targetCharacterId) : null;

    let insertedUserMessage: GroupMessageRow | null = null;
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

    let llmRes: Awaited<ReturnType<typeof generateLLMResponse>>;
    try {
      llmRes = await generateLLMResponse(llmMessages, {
        userId: user.id,
        temperature,
        maxTokens,
        characterId: speaker.id,
        chatId: id,
        actionType: 'group_chat',
      });
    } catch (err) {
      if (insertedUserMessage) await execute('DELETE FROM group_messages WHERE id = $1', [insertedUserMessage.id]);
      throw err;
    }

    const cleanedReply = cleanCharacterOutput(llmRes.text, speaker.name);
    if (!cleanedReply) {
      if (insertedUserMessage) await execute('DELETE FROM group_messages WHERE id = $1', [insertedUserMessage.id]);
      return jsonError('Model menghasilkan respons kosong. Silakan coba lagi.', 400);
    }

    const charMsgId = newId('gmsg');
    const replyTime = nowIso(5);
    await execute(
      `INSERT INTO group_messages (id, group_chat_id, role, character_id, content, created_at)
       VALUES ($1, $2, 'character', $3, $4, $5)`,
      [charMsgId, id, speaker.id, cleanedReply, replyTime]
    );
    await execute('UPDATE group_chats SET last_speaker_id = $1, updated_at = now() WHERE id = $2 AND user_id = $3', [
      speaker.id,
      id,
      user.id,
    ]);

    const charMsg = await queryOne<GroupMessageRow>(`${GROUP_MESSAGES_SQL} WHERE gm.id = $1`, [charMsgId]);
    return NextResponse.json({ userMessage: insertedUserMessage, characterMessage: charMsg });
  } catch (err) {
    return handleApiError(err, 'Gagal memproses giliran grup chat.', 400);
  }
}

export async function PATCH(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const body = await readJson(req);
    await requireOwnedGroupChat(user.id, id);

    let personaId: string | null = null;
    if (body.persona_id) {
      const owned = await queryOne<{ id: string }>(
        'SELECT id FROM user_personas WHERE id = $1 AND user_id = $2',
        [String(body.persona_id), user.id]
      );
      if (!owned) return jsonError('Persona tidak ditemukan.', 404);
      personaId = owned.id;
    }

    const updated = await queryOne(
      'UPDATE group_chats SET persona_id = $1, updated_at = now() WHERE id = $2 AND user_id = $3 RETURNING *',
      [personaId, id, user.id]
    );
    const activePersona = personaId ? await getPersonaById(user.id, personaId) : await getDefaultPersona(user.id);
    return NextResponse.json({ groupChat: stripOwner(updated), activePersona: formatPersona(activePersona) });
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui persona grup chat.');
  }
}

export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    await requireOwnedGroupChat(user.id, id);
    await execute('DELETE FROM group_chats WHERE id = $1 AND user_id = $2', [id, user.id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus grup chat.');
  }
}
