import { NextRequest, NextResponse } from 'next/server';
import {
  CharacterRow,
  ChatRow,
  formatCharacterRow,
  getAllPersonas,
  getDb,
  getDefaultPersona,
  getPersonaById,
  getSettingsMap,
  MessageRow,
} from '@/lib/db';
import { generateLLMResponse } from '@/lib/llm';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = getDb();

    const chat = (db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as unknown) as ChatRow | undefined;
    if (!chat) {
      return NextResponse.json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
    }

    const character = (db
      .prepare(`
        SELECT c.*, w.name as world_name
        FROM characters c
        LEFT JOIN worlds w ON c.world_id = w.id
        WHERE c.id = ?
      `)
      .get(chat.character_id) as unknown) as (CharacterRow & { world_name?: string | null }) | undefined;

    if (!character) {
      return NextResponse.json({ error: 'Karakter untuk percakapan ini tidak ditemukan.' }, { status: 404 });
    }

    const rawMessages = (db
      .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
      .all(id) as unknown) as MessageRow[];

    const messages = rawMessages.map((m) => {
      let alternatives: string[] = [];
      try {
        alternatives = JSON.parse(m.alternatives || '[]');
      } catch {
        alternatives = [m.content];
      }
      if (alternatives.length === 0) alternatives = [m.content];
      return {
        ...m,
        alternatives,
        is_pinned_memory: Boolean(m.is_pinned_memory),
      };
    });

    const memories = db
      .prepare('SELECT * FROM memories WHERE character_id = ? OR character_id IS NULL ORDER BY created_at DESC')
      .all(chat.character_id);

    const otherChats = db
      .prepare('SELECT id, title, updated_at FROM chats WHERE character_id = ? ORDER BY updated_at DESC')
      .all(chat.character_id);

    const activePersona = chat.persona_id
      ? getPersonaById(chat.persona_id)
      : getDefaultPersona();
    const personas = getAllPersonas().map((p) => ({
      ...p,
      is_default: Boolean(p.is_default),
    }));

    const settings = getSettingsMap();
    const resolvedChat = {
      ...chat,
      persona_id: chat.persona_id || activePersona?.id || null,
      use_latest_persona: Boolean(chat.use_latest_persona),
      temperature:
        chat.temperature ??
        character.temperature_override ??
        (parseFloat(settings.temperature || '0.9') || 0.9),
      max_tokens: chat.max_tokens ?? (parseInt(settings.max_tokens || '1024', 10) || 1024),
      reply_style: chat.reply_style || settings.default_reply_style || 'sedang',
    };

    return NextResponse.json({
      chat: resolvedChat,
      character: formatCharacterRow(character),
      messages,
      memories,
      otherChats,
      activePersona,
      personas,
      defaultSettings: {
        temperature: settings.temperature || '0.9',
        max_tokens: settings.max_tokens || '1024',
        default_reply_style: settings.default_reply_style || 'sedang',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat ruang percakapan.';
    return NextResponse.json({ error: message }, { status: 500 });
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

    const existing = (db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as unknown) as ChatRow | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
    }

    // Jika user memicu pembuatan ringkasan percakapan (Fase 2)
    if (body.action === 'summarize') {
      const msgs = (db
        .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
        .all(id) as unknown) as MessageRow[];

      if (msgs.length < 4) {
        return NextResponse.json(
          { error: 'Percakapan masih terlalu singkat untuk diringkas (minimal 4 pesan).' },
          { status: 400 }
        );
      }

      const character = (db
        .prepare('SELECT name FROM characters WHERE id = ?')
        .get(existing.character_id) as unknown) as { name: string } | undefined;
      const charName = character?.name || 'Karakter';

      const transcript = msgs
        .map((m) => `${m.role === 'character' ? charName : 'Pengguna'}: ${m.content}`)
        .join('\n\n')
        .slice(-14000);

      const sumRes = await generateLLMResponse(
        [
          {
            role: 'system',
            content:
              'Ringkas jalannya cerita, fakta penting, dan dinamika hubungan dalam percakapan berikut secara padat dalam Bahasa Indonesia (4-6 kalimat). Fokus pada detail yang harus tetap diingat oleh karakter untuk melanjutkan percakapan.',
          },
          { role: 'user', content: transcript },
        ],
        {
          temperature: 0.4,
          maxTokens: 500,
          characterId: existing.character_id,
          chatId: id,
          actionType: 'summary',
        }
      );

      const lastMsgId = msgs[msgs.length - 1]?.id || null;
      db.prepare(`
        UPDATE chats SET summary = ?, summarized_until_msg_id = ?, updated_at = ? WHERE id = ?
      `).run(sumRes.text, lastMsgId, new Date().toISOString(), id);

      const updated = db.prepare('SELECT * FROM chats WHERE id = ?').get(id);
      return NextResponse.json({ chat: updated, summary: sumRes.text });
    }

    const title = body.title !== undefined ? String(body.title).trim() : existing.title;
    const summary = body.summary !== undefined ? String(body.summary).trim() : existing.summary;
    const temperature =
      body.temperature !== undefined
        ? body.temperature === null || body.temperature === ''
          ? null
          : Number(body.temperature)
        : existing.temperature;
    const maxTokens =
      body.max_tokens !== undefined
        ? body.max_tokens === null || body.max_tokens === ''
          ? null
          : Number(body.max_tokens)
        : existing.max_tokens;
    const replyStyle = body.reply_style !== undefined ? String(body.reply_style) : existing.reply_style;
    const personaId =
      body.persona_id !== undefined
        ? body.persona_id
          ? String(body.persona_id)
          : null
        : existing.persona_id || null;
    const selectedPersonaObj = personaId ? getPersonaById(personaId) : null;
    const personaSnapshot = selectedPersonaObj
      ? JSON.stringify(selectedPersonaObj)
      : existing.persona_snapshot;
    const useLatestPersona =
      body.use_latest_persona !== undefined ? (body.use_latest_persona ? 1 : 0) : existing.use_latest_persona;

    db.prepare(`
      UPDATE chats SET
        title = ?,
        summary = ?,
        temperature = ?,
        max_tokens = ?,
        reply_style = ?,
        persona_id = ?,
        persona_snapshot = ?,
        use_latest_persona = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      title || existing.title,
      summary,
      temperature,
      maxTokens,
      replyStyle,
      personaId,
      personaSnapshot,
      useLatestPersona,
      new Date().toISOString(),
      id
    );

    const updated = db.prepare('SELECT * FROM chats WHERE id = ?').get(id);
    const activePersona = personaId ? getPersonaById(personaId) : getDefaultPersona();
    return NextResponse.json({ chat: updated, activePersona });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui pengaturan percakapan.';
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
    db.prepare('DELETE FROM chats WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus percakapan.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
