import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { CharacterRow, GroupChatRow, query, queryOne, withTransaction } from '@/lib/db';
import { stripOwner } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { clampMaxTokens, clampTemperature, getDefaultPersona, getPersonaById, getUserSettings } from '@/lib/store';

export const runtime = 'nodejs';

const MAX_GROUP_MEMBERS = 8;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const groups = await query<GroupChatRow & { message_count: number }>(
      `SELECT g.*, (SELECT COUNT(*) FROM group_messages gm WHERE gm.group_chat_id = g.id) AS message_count
       FROM group_chats g WHERE g.user_id = $1 ORDER BY g.updated_at DESC`,
      [user.id]
    );
    if (groups.length === 0) return NextResponse.json({ groupChats: [] });

    const members = await query<{ group_chat_id: string; id: string; name: string; tagline: string; avatar: string; join_order: number }>(
      `SELECT gm.group_chat_id, c.id, c.name, c.tagline, c.avatar, gm.join_order
       FROM group_chat_members gm
       JOIN characters c ON gm.character_id = c.id
       WHERE gm.group_chat_id = ANY($1) AND c.user_id = $2
       ORDER BY gm.join_order ASC`,
      [groups.map((g) => g.id), user.id]
    );

    const enriched = groups.map((g) => ({
      ...stripOwner(g),
      members: members.filter((m) => m.group_chat_id === g.id).map(({ group_chat_id: _g, ...m }) => m),
      message_count: Number(g.message_count || 0),
    }));
    return NextResponse.json({ groupChats: enriched });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat daftar grup chat.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const title = String(body.title || '').trim().slice(0, 120);
    const scenario = String(body.scenario || '').trim();
    const characterIds: string[] = Array.isArray(body.characterIds)
      ? Array.from(new Set<string>(body.characterIds.map(String).filter(Boolean)))
      : [];

    if (characterIds.length < 2) return jsonError('Pilih minimal 2 karakter untuk membuat Grup Chat.', 400);
    if (characterIds.length > MAX_GROUP_MEMBERS) {
      return jsonError(`Maksimal ${MAX_GROUP_MEMBERS} karakter dalam satu grup.`, 400);
    }

    // Hanya karakter milik pengguna sendiri yang boleh dimasukkan
    const owned = await query<CharacterRow>(
      'SELECT * FROM characters WHERE id = ANY($1) AND user_id = $2',
      [characterIds, user.id]
    );
    const chars = characterIds
      .map((cid) => owned.find((c) => c.id === cid))
      .filter((c): c is CharacterRow => Boolean(c));
    if (chars.length < 2) return jsonError('Karakter yang dipilih tidak ditemukan.', 400);

    const settings = await getUserSettings(user.id);
    const persona = body.personaId
      ? await getPersonaById(user.id, String(body.personaId))
      : await getDefaultPersona(user.id);
    const temp = clampTemperature(
      body.temperature !== undefined && body.temperature !== null && body.temperature !== ''
        ? body.temperature
        : settings.temperature,
      0.9
    );
    const maxTokens = clampMaxTokens(
      body.maxTokens !== undefined && body.maxTokens !== null && body.maxTokens !== ''
        ? body.maxTokens
        : settings.max_tokens,
      1024
    );
    const turnMode = ['auto', 'mentioned', 'round_robin'].includes(body.turn_mode) ? body.turn_mode : 'auto';

    const id = newId('gchat');
    const created = await withTransaction(async (client) => {
      const row = await queryOne<GroupChatRow>(
        `INSERT INTO group_chats (id, user_id, title, scenario, turn_mode, last_speaker_id, temperature, max_tokens, persona_id)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8) RETURNING *`,
        [id, user.id, title || `Grup: ${chars.map((c) => c.name).join(', ')}`.slice(0, 120), scenario, turnMode, temp, maxTokens, persona?.id || null],
        client
      );
      for (const [idx, c] of chars.entries()) {
        await client.query(
          'INSERT INTO group_chat_members (group_chat_id, character_id, join_order) VALUES ($1, $2, $3)',
          [id, c.id, idx]
        );
      }
      return row;
    });

    return NextResponse.json({ groupChat: stripOwner(created!) }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal membuat grup chat.');
  }
}
