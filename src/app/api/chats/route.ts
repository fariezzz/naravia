import { NextRequest, NextResponse } from 'next/server';
import { replacePlaceholders } from '@/lib/character';
import { CharacterRow, getDb, getDefaultPersona, getPersonaById, getSettingsMap } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');
    const db = getDb();

    if (characterId) {
      const chats = db
        .prepare(`
          SELECT
            ch.*,
            c.name as character_name,
            c.avatar as character_avatar,
            c.tagline as character_tagline,
            COUNT(m.id) as message_count,
            (SELECT content FROM messages WHERE chat_id = ch.id ORDER BY created_at DESC LIMIT 1) as last_message
          FROM chats ch
          JOIN characters c ON ch.character_id = c.id
          LEFT JOIN messages m ON m.chat_id = ch.id
          WHERE ch.character_id = ?
          GROUP BY ch.id
          ORDER BY ch.updated_at DESC
        `)
        .all(characterId);
      return NextResponse.json({ chats });
    }

    const chats = db
      .prepare(`
        SELECT
          ch.*,
          c.name as character_name,
          c.avatar as character_avatar,
          c.tagline as character_tagline,
          COUNT(m.id) as message_count,
          (SELECT content FROM messages WHERE chat_id = ch.id ORDER BY created_at DESC LIMIT 1) as last_message
        FROM chats ch
        JOIN characters c ON ch.character_id = c.id
        LEFT JOIN messages m ON m.chat_id = ch.id
        GROUP BY ch.id
        ORDER BY ch.updated_at DESC
      `)
      .all();

    return NextResponse.json({ chats });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat daftar percakapan.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const characterId = String(body.characterId || '').trim();
    if (!characterId) {
      return NextResponse.json({ error: 'ID karakter wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const character = (db
      .prepare('SELECT * FROM characters WHERE id = ?')
      .get(characterId) as unknown) as CharacterRow | undefined;

    if (!character) {
      return NextResponse.json({ error: 'Karakter tidak ditemukan.' }, { status: 404 });
    }

    const persona = body.personaId
      ? getPersonaById(String(body.personaId))
      : getDefaultPersona();

    const userName = persona?.display_name || 'Kamu';
    const now = new Date().toISOString();
    const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    let greetings: string[] = [];
    try {
      greetings = JSON.parse(character.greeting || '[]');
    } catch {
      greetings = [];
    }

    const greetingIndex = Number(body.greetingIndex || 0);
    const chosenGreetingRaw =
      greetings[greetingIndex] ||
      greetings[0] ||
      `Halo ${userName}, senang akhirnya kita bisa mengobrol.`;

    const chosenGreeting = replacePlaceholders(chosenGreetingRaw, character.name, userName);
    const formattedAlternates = greetings.map((g) => replacePlaceholders(g, character.name, userName));

    const title = String(body.title || '').trim() || `Percakapan dengan ${character.name}`;

    const settings = getSettingsMap();
    const effectiveTemp =
      character.temperature_override ??
      (body.temperature !== undefined && body.temperature !== null && body.temperature !== ''
        ? Number(body.temperature)
        : parseFloat(settings.temperature || '0.9') || 0.9);

    const effectiveMaxTokens =
      body.maxTokens !== undefined && body.maxTokens !== null && body.maxTokens !== ''
        ? Number(body.maxTokens)
        : parseInt(settings.max_tokens || '1024', 10) || 1024;

    const effectiveReplyStyle = body.replyStyle || settings.default_reply_style || 'sedang';

    db.prepare(`
      INSERT INTO chats (
        id, character_id, title, summary, summarized_until_msg_id,
        temperature, max_tokens, reply_style, persona_id, persona_snapshot, use_latest_persona,
        created_at, updated_at
      ) VALUES (?, ?, ?, '', NULL, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      chatId,
      characterId,
      title,
      effectiveTemp,
      effectiveMaxTokens,
      effectiveReplyStyle,
      persona?.id || null,
      persona ? JSON.stringify(persona) : null,
      now,
      now
    );

    const firstMsgId = `msg-${Date.now()}-init`;
    const activeAltIndex = formattedAlternates.indexOf(chosenGreeting) >= 0 ? formattedAlternates.indexOf(chosenGreeting) : 0;

    db.prepare(`
      INSERT INTO messages (
        id, chat_id, role, content, alternatives, active_alt_index, is_pinned_memory, created_at
      ) VALUES (?, ?, 'character', ?, ?, ?, 0, ?)
    `).run(
      firstMsgId,
      chatId,
      chosenGreeting,
      JSON.stringify(formattedAlternates.length > 0 ? formattedAlternates : [chosenGreeting]),
      activeAltIndex,
      now
    );

    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
    return NextResponse.json({ chat }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memulai percakapan baru.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
