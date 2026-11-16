import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildCharacterSystemPrompt } from '@/lib/character';
import { CharacterRow, execute, MemoryRow, nowIso, query, queryOne } from '@/lib/db';
import { stripOwner } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { cleanCharacterOutput, generateLLMResponse, LLMMessage } from '@/lib/llm';
import { getRelevantLore } from '@/lib/lore';
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

interface GroupMessageRow {
  id: string;
  group_chat_id: string;
  role: 'user' | 'character';
  character_id: string | null;
  character_name?: string;
  character_avatar?: string;
  content: string;
  created_at: string;
}

async function loadMembers(groupId: string, userId: string) {
  return query<CharacterRow>(
    `SELECT c.* FROM group_chat_members gm
     JOIN characters c ON gm.character_id = c.id
     WHERE gm.group_chat_id = $1 AND c.user_id = $2
     ORDER BY gm.join_order ASC`,
    [groupId, userId]
  );
}

const GROUP_MESSAGES_SQL = `
  SELECT gm.*, c.name AS character_name, c.avatar AS character_avatar
  FROM group_messages gm
  LEFT JOIN characters c ON gm.character_id = c.id`;

export async function GET(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const groupChat = await requireOwnedGroupChat(user.id, id);

    const [members, messages, personas] = await Promise.all([
      loadMembers(id, user.id),
      query<GroupMessageRow>(`${GROUP_MESSAGES_SQL} WHERE gm.group_chat_id = $1 ORDER BY gm.created_at ASC`, [id]),
      getAllPersonas(user.id),
    ]);
    const activePersona = groupChat.persona_id
      ? await getPersonaById(user.id, groupChat.persona_id)
      : await getDefaultPersona(user.id);

    return NextResponse.json({
      groupChat: { ...stripOwner(groupChat), persona_id: groupChat.persona_id || activePersona?.id || null },
      members: members.map(stripOwner),
      messages,
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

    const members = await loadMembers(id, user.id);
    if (members.length === 0) return jsonError('Tidak ada anggota karakter di dalam grup ini.', 400);

    const persona = groupChat.persona_id
      ? await getPersonaById(user.id, groupChat.persona_id)
      : await getDefaultPersona(user.id);
    const userName = persona?.display_name || 'Kamu';

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

    // Tentukan karakter yang mendapat giliran bicara
    let activeSpeaker: CharacterRow | undefined = forcedCharacterId
      ? members.find((m) => m.id === forcedCharacterId)
      : undefined;

    if (!activeSpeaker) {
      const lastMessageText = (history[history.length - 1]?.content || '').toLowerCase();
      const mentioned = members.find((m) => {
        const firstName = m.name.split(/\s+/)[0].toLowerCase();
        return (
          m.id !== groupChat.last_speaker_id &&
          (lastMessageText.includes(m.name.toLowerCase()) ||
            (firstName.length >= 3 && lastMessageText.includes(firstName)))
        );
      });
      if (mentioned) {
        activeSpeaker = mentioned;
      } else {
        const lastIdx = members.findIndex((m) => m.id === groupChat.last_speaker_id);
        activeSpeaker = members[(lastIdx + 1) % members.length] || members[0];
      }
    }
    const speaker = activeSpeaker;

    const otherMemberNames = members
      .filter((m) => m.id !== speaker.id)
      .map((m) => `${m.name} (${m.tagline || m.personality.slice(0, 60)})`)
      .join('; ');

    const recentText = history.slice(-15).map((m) => m.content).join('\n');
    const [lore, memories] = await Promise.all([
      getRelevantLore(user.id, speaker.world_id, recentText),
      query<MemoryRow>(
        `SELECT * FROM memories WHERE user_id = $2 AND (character_id = $1 OR character_id IS NULL)
         ORDER BY created_at DESC LIMIT 15`,
        [speaker.id, user.id]
      ),
    ]);

    const baseSysPrompt = buildCharacterSystemPrompt({
      character: speaker,
      persona: persona || null,
      memories,
      lore,
      replyStyle: 'sedang',
    });

    const groupSysPrompt = `${baseSysPrompt}

KONTEKS GRUP CHAT MULTI-KARAKTER:
- Judul Ruang: ${groupChat.title}
${groupChat.scenario ? `- Situasi Grup: ${groupChat.scenario}` : ''}
- Karakter lain yang hadir di ruangan ini bersama kamu dan ${userName}: ${otherMemberNames}.
- Kamu HANYA berbicara dan bertindak sebagai ${speaker.name}. Jangan menuliskan dialog atas nama karakter lain atau atas nama ${userName}.`;

    const transcriptLines = history.slice(-18).map((m) => {
      const speakerName = m.role === 'user' ? userName : m.character_name || 'Karakter';
      return `${speakerName}: ${m.content}`;
    });

    const llmMessages: LLMMessage[] = [
      { role: 'system', content: groupSysPrompt },
      {
        role: 'user',
        content: `RIWAYAT PERCAKAPAN GRUP SAAT INI:\n${transcriptLines.join('\n\n')}\n\nSekarang giliran ${speaker.name} merespons secara natural sesuai kepribadiannya:`,
      },
    ];

    let llmRes;
    try {
      llmRes = await generateLLMResponse(llmMessages, {
        userId: user.id,
        temperature: groupChat.temperature || 0.9,
        maxTokens: groupChat.max_tokens || 1024,
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
