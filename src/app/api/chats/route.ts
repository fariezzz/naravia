import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { replacePlaceholders } from '@/lib/character';
import { ChatRow, query, queryOne, withTransaction } from '@/lib/db';
import { parseJsonSafe, stripOwner } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { getDefaultPersona, getPersonaById, getUserSettings, requireVisibleCharacter } from '@/lib/store';

export const runtime = 'nodejs';

// LEFT JOIN karena karakter bisa sudah dihapus pemiliknya; identitas karakter
// lalu diambil dari snapshot agar riwayat percakapan tetap bisa dibuka.
const CHAT_LIST_SQL = `
  SELECT
    ch.*,
    COALESCE(c.name, ch.character_snapshot::json->>'name', 'Karakter Terhapus') AS character_name,
    COALESCE(c.avatar, ch.character_snapshot::json->>'avatar', '') AS character_avatar,
    COALESCE(c.tagline, ch.character_snapshot::json->>'tagline', '') AS character_tagline,
    (c.id IS NULL) AS character_deleted,
    (SELECT COUNT(*) FROM messages m WHERE m.chat_id = ch.id) AS message_count,
    (SELECT content FROM messages m WHERE m.chat_id = ch.id ORDER BY created_at DESC LIMIT 1) AS last_message
  FROM chats ch
  LEFT JOIN characters c ON ch.character_id = c.id
  WHERE ch.user_id = $1`;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const characterId = new URL(req.url).searchParams.get('characterId');

    const chats = characterId
      ? await query(`${CHAT_LIST_SQL} AND ch.character_id = $2 ORDER BY ch.updated_at DESC`, [user.id, characterId])
      : await query(`${CHAT_LIST_SQL} ORDER BY ch.updated_at DESC`, [user.id]);

    return NextResponse.json({ chats: chats.map(stripOwner) });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat daftar percakapan.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const characterId = String(body.characterId || '').trim();
    if (!characterId) return jsonError('ID karakter wajib diisi.', 400);

    // Karakter publik milik orang lain boleh dipakai; karakter privat orang lain tetap 404
    const character = await requireVisibleCharacter(user.id, characterId);
    const persona = body.personaId
      ? await getPersonaById(user.id, String(body.personaId))
      : await getDefaultPersona(user.id);

    const userName = persona?.display_name || 'Kamu';
    const greetings = parseJsonSafe<string[]>(character.greeting, []);
    const greetingIndex = Number(body.greetingIndex || 0);
    const chosenGreetingRaw =
      greetings[greetingIndex] || greetings[0] || `Halo ${userName}, senang akhirnya kita bisa mengobrol.`;

    const chosenGreeting = replacePlaceholders(chosenGreetingRaw, character.name, userName);
    const formattedAlternates = greetings.map((g) => replacePlaceholders(g, character.name, userName));
    const title = String(body.title || '').trim().slice(0, 120) || `Percakapan dengan ${character.name}`;

    const settings = await getUserSettings(user.id);
    const effectiveTemp =
      character.temperature_override ??
      (body.temperature !== undefined && body.temperature !== null && body.temperature !== ''
        ? Number(body.temperature)
        : parseFloat(settings.temperature || '0.9') || 0.9);
    const effectiveMaxTokens =
      body.maxTokens !== undefined && body.maxTokens !== null && body.maxTokens !== ''
        ? Number(body.maxTokens)
        : parseInt(settings.max_tokens || '1024', 10) || 1024;
    const effectiveReplyStyle = String(body.replyStyle || settings.default_reply_style || 'sedang');

    const chatId = newId('chat');
    const activeAltIndex = Math.max(0, formattedAlternates.indexOf(chosenGreeting));

    // Definisi karakter dibekukan di sini. Suntingan pemilik setelah ini hanya
    // berlaku untuk percakapan baru, dan percakapan ini tetap utuh walau
    // karakter aslinya kemudian diubah atau dihapus.
    const { creator_name: _nama, is_owner: _pemilik, ...snapshotFields } = character;
    const characterSnapshot = JSON.stringify(stripOwner(snapshotFields));

    const chat = await withTransaction(async (client) => {
      const created = await queryOne<ChatRow>(
        `INSERT INTO chats (
           id, user_id, character_id, character_snapshot, title, summary, summarized_until_msg_id,
           temperature, max_tokens, reply_style, persona_id, persona_snapshot, use_latest_persona
         ) VALUES ($1, $2, $3, $10, $4, '', NULL, $5, $6, $7, $8, $9, 0)
         RETURNING *`,
        [
          chatId,
          user.id,
          characterId,
          title,
          effectiveTemp,
          effectiveMaxTokens,
          effectiveReplyStyle,
          persona?.id || null,
          persona ? JSON.stringify(stripOwner(persona)) : null,
          characterSnapshot,
        ],
        client
      );

      await client.query(
        `INSERT INTO messages (id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory)
         VALUES ($1, $2, 'character', $3, $4, $5, 0)`,
        [
          newId('msg'),
          chatId,
          chosenGreeting,
          JSON.stringify(formattedAlternates.length > 0 ? formattedAlternates : [chosenGreeting]),
          activeAltIndex,
        ]
      );
      return created;
    });

    return NextResponse.json({ chat: stripOwner(chat!) }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal memulai percakapan baru.');
  }
}
