import { NextRequest, NextResponse } from 'next/server';
import { buildCharacterSystemPrompt } from '@/lib/character';
import {
  CharacterRow,
  getAllPersonas,
  getDb,
  getDefaultPersona,
  getPersonaById,
  GroupChatRow,
  MemoryRow,
} from '@/lib/db';
import { cleanCharacterOutput, generateLLMResponse, LLMMessage } from '@/lib/llm';
import { getRelevantLore } from '@/lib/lore';

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

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = getDb();

    const groupChat = (db
      .prepare('SELECT * FROM group_chats WHERE id = ?')
      .get(id) as unknown) as GroupChatRow | undefined;

    if (!groupChat) {
      return NextResponse.json({ error: 'Grup chat tidak ditemukan.' }, { status: 404 });
    }

    const members = (db
      .prepare(`
        SELECT c.*
        FROM group_chat_members gm
        JOIN characters c ON gm.character_id = c.id
        WHERE gm.group_chat_id = ?
        ORDER BY gm.join_order ASC
      `)
      .all(id) as unknown) as CharacterRow[];

    const messages = (db
      .prepare(`
        SELECT gm.*, c.name as character_name, c.avatar as character_avatar
        FROM group_messages gm
        LEFT JOIN characters c ON gm.character_id = c.id
        WHERE gm.group_chat_id = ?
        ORDER BY gm.created_at ASC
      `)
      .all(id) as unknown) as GroupMessageRow[];

    const activePersona = groupChat.persona_id
      ? getPersonaById(groupChat.persona_id)
      : getDefaultPersona();
    const personas = getAllPersonas().map((p) => ({
      ...p,
      is_default: Boolean(p.is_default),
    }));

    return NextResponse.json({
      groupChat: {
        ...groupChat,
        persona_id: groupChat.persona_id || activePersona?.id || null,
      },
      members,
      messages,
      activePersona,
      personas,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat ruang grup chat.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const db = getDb();

    const groupChat = (db
      .prepare('SELECT * FROM group_chats WHERE id = ?')
      .get(id) as unknown) as GroupChatRow | undefined;

    if (!groupChat) {
      return NextResponse.json({ error: 'Grup chat tidak ditemukan.' }, { status: 404 });
    }

    const members = (db
      .prepare(`
        SELECT c.*
        FROM group_chat_members gm
        JOIN characters c ON gm.character_id = c.id
        WHERE gm.group_chat_id = ?
        ORDER BY gm.join_order ASC
      `)
      .all(id) as unknown) as CharacterRow[];

    if (members.length === 0) {
      return NextResponse.json({ error: 'Tidak ada anggota karakter di dalam grup ini.' }, { status: 400 });
    }

    const persona = groupChat.persona_id
      ? getPersonaById(groupChat.persona_id)
      : getDefaultPersona();
    const userName = persona?.display_name || 'Kamu';

    const userContent = String(body.content || '').trim();
    const forcedCharacterId = body.targetCharacterId ? String(body.targetCharacterId) : null;

    let insertedUserMessage: GroupMessageRow | null = null;
    if (userContent) {
      const userMsgId = `gmsg-${Date.now()}-u`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO group_messages (id, group_chat_id, role, character_id, content, created_at)
        VALUES (?, ?, 'user', NULL, ?, ?)
      `).run(userMsgId, id, userContent, now);

      insertedUserMessage = (db
        .prepare('SELECT * FROM group_messages WHERE id = ?')
        .get(userMsgId) as unknown) as GroupMessageRow;
    }

    // Ambil riwayat grup terbaru
    const history = (db
      .prepare(`
        SELECT gm.*, c.name as character_name
        FROM group_messages gm
        LEFT JOIN characters c ON gm.character_id = c.id
        WHERE gm.group_chat_id = ?
        ORDER BY gm.created_at ASC
      `)
      .all(id) as unknown) as GroupMessageRow[];

    // Tentukan karakter mana yang mendapat giliran bicara
    let activeSpeaker: CharacterRow | undefined;

    if (forcedCharacterId) {
      activeSpeaker = members.find((m) => m.id === forcedCharacterId);
    }

    if (!activeSpeaker) {
      const lastMessageText = (history[history.length - 1]?.content || '').toLowerCase();
      // Cek apakah ada nama karakter yang disebut di pesan terakhir
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
        const nextIdx = (lastIdx + 1) % members.length;
        activeSpeaker = members[nextIdx] || members[0];
      }
    }

    const otherMemberNames = members
      .filter((m) => m.id !== activeSpeaker!.id)
      .map((m) => `${m.name} (${m.tagline || m.personality.slice(0, 60)})`)
      .join('; ');

    const recentText = history
      .slice(-15)
      .map((m) => m.content)
      .join('\n');

    const lore = getRelevantLore(activeSpeaker.world_id, recentText);
    const memories = (db
      .prepare('SELECT * FROM memories WHERE character_id = ? OR character_id IS NULL ORDER BY created_at DESC LIMIT 15')
      .all(activeSpeaker.id) as unknown) as MemoryRow[];

    const baseSysPrompt = buildCharacterSystemPrompt({
      character: activeSpeaker,
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
- Kamu HANYA berbicara dan bertindak sebagai ${activeSpeaker.name}. Jangan menuliskan dialog atas nama karakter lain atau atas nama ${userName}.`;

    const transcriptLines = history.slice(-18).map((m) => {
      const speakerName = m.role === 'user' ? userName : m.character_name || 'Karakter';
      return `${speakerName}: ${m.content}`;
    });

    const llmMessages: LLMMessage[] = [
      { role: 'system', content: groupSysPrompt },
      {
        role: 'user',
        content: `RIWAYAT PERCAKAPAN GRUP SAAT INI:\n${transcriptLines.join('\n\n')}\n\nSekarang giliran ${activeSpeaker.name} merespons secara natural sesuai kepribadiannya:`,
      },
    ];

    let llmRes;
    try {
      llmRes = await generateLLMResponse(llmMessages, {
        temperature: groupChat.temperature || 0.9,
        maxTokens: groupChat.max_tokens || 1024,
        characterId: activeSpeaker.id,
        chatId: id,
        actionType: 'group_chat',
      });
    } catch (err) {
      if (insertedUserMessage) {
        db.prepare('DELETE FROM group_messages WHERE id = ?').run(insertedUserMessage.id);
      }
      throw err;
    }

    const cleanedReply = cleanCharacterOutput(llmRes.text, activeSpeaker.name);
    const charMsgId = `gmsg-${Date.now()}-c`;
    const replyTime = new Date(Date.now() + 5).toISOString();

    db.prepare(`
      INSERT INTO group_messages (id, group_chat_id, role, character_id, content, created_at)
      VALUES (?, ?, 'character', ?, ?, ?)
    `).run(charMsgId, id, activeSpeaker.id, cleanedReply, replyTime);

    db.prepare('UPDATE group_chats SET last_speaker_id = ?, updated_at = ? WHERE id = ?').run(
      activeSpeaker.id,
      replyTime,
      id
    );

    const charMsg = (db
      .prepare(`
        SELECT gm.*, c.name as character_name, c.avatar as character_avatar
        FROM group_messages gm
        LEFT JOIN characters c ON gm.character_id = c.id
        WHERE gm.id = ?
      `)
      .get(charMsgId) as unknown) as GroupMessageRow;

    return NextResponse.json({
      userMessage: insertedUserMessage,
      characterMessage: charMsg,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memproses giliran grup chat.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const db = getDb();

    const personaId = body.persona_id ? String(body.persona_id) : null;
    db.prepare('UPDATE group_chats SET persona_id = ?, updated_at = ? WHERE id = ?').run(
      personaId,
      new Date().toISOString(),
      id
    );

    const updated = db.prepare('SELECT * FROM group_chats WHERE id = ?').get(id);
    const activePersona = personaId ? getPersonaById(personaId) : getDefaultPersona();
    return NextResponse.json({ groupChat: updated, activePersona });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui persona grup chat.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = getDb();
    db.prepare('DELETE FROM group_chats WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus grup chat.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
