import { buildCharacterSystemPrompt } from './character';
import { CharacterRow, GroupChatRow, query } from './db';
import { LLMMessage } from './llm';
import { getRelevantLore } from './lore';
import { getRelevantMemories } from './memories';
import { getDefaultPersona, getPersonaById } from './store';

export interface GroupMessageRow {
  id: string;
  group_chat_id: string;
  role: 'user' | 'character';
  character_id: string | null;
  character_name?: string;
  character_avatar?: string;
  content: string;
  created_at: string;
}

export const GROUP_MESSAGES_SQL = `
  SELECT gm.*, c.name AS character_name, c.avatar AS character_avatar
  FROM group_messages gm
  LEFT JOIN characters c ON gm.character_id = c.id`;

export async function loadGroupMembers(groupId: string, userId: string): Promise<CharacterRow[]> {
  return query<CharacterRow>(
    `SELECT c.* FROM group_chat_members gm
     JOIN characters c ON gm.character_id = c.id
     WHERE gm.group_chat_id = $1 AND c.user_id = $2
     ORDER BY gm.join_order ASC`,
    [groupId, userId]
  );
}

export async function buildGroupTurnContext(params: {
  userId: string;
  groupChat: GroupChatRow;
  members: CharacterRow[];
  history: GroupMessageRow[];
  forcedCharacterId?: string | null;
}) {
  const { userId, groupChat, members, history, forcedCharacterId } = params;
  const persona = groupChat.persona_id
    ? await getPersonaById(userId, groupChat.persona_id)
    : await getDefaultPersona(userId);
  const userName = persona?.display_name || 'Kamu';

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
  const [lore, memoryResult] = await Promise.all([
    getRelevantLore(userId, speaker.world_id, recentText, {
      allowPublicWorld: speaker.visibility === 'public',
    }),
    getRelevantMemories({
      userId,
      characterId: speaker.id,
      recentText,
      limit: 15,
    }),
  ]);
  const memories = memoryResult.memories;

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

  return {
    speaker,
    llmMessages,
    temperature: groupChat.temperature || 0.9,
    maxTokens: groupChat.max_tokens || 1024,
  };
}
