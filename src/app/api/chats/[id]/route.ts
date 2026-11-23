import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { CharacterRow, ChatRow, execute, MessageRow, query, queryOne } from '@/lib/db';
import { formatCharacterRow, formatMessageRow, stripOwner } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { generateLLMResponse } from '@/lib/llm';
import { sanitizeMemoryForClient } from '@/lib/memories';
import { enforceLlmRateLimit } from '@/lib/rateLimit';
import {
  formatPersona,
  getAllPersonas,
  getDefaultPersona,
  getPersonaById,
  getUserSettings,
  requireOwnedChat,
  resolveChatCharacter,
} from '@/lib/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const chat = await requireOwnedChat(user.id, id);

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get('limit') || '60', 10);
    const limit = Number.isFinite(limitParam) ? Math.max(10, Math.min(200, limitParam)) : 60;
    const before = url.searchParams.get('before')?.trim() || '';
    const messagesOnly = url.searchParams.get('messagesOnly') === '1';

    const countRow = await queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = $1', [id]);
    const totalMessages = Number(countRow?.cnt || 0);

    // Ambil N+1 pesan terbaru (atau sebelum cursor `before`) untuk menentukan apakah masih ada pesan lebih lama
    const fetchedDesc = before
      ? await query<MessageRow>(
          `SELECT * FROM messages WHERE chat_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3`,
          [id, before, limit + 1]
        )
      : await query<MessageRow>(
          `SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [id, limit + 1]
        );

    const hasMoreMessages = fetchedDesc.length > limit;
    const pageRows = (hasMoreMessages ? fetchedDesc.slice(0, limit) : fetchedDesc).reverse();
    const oldestCursor = pageRows[0]?.created_at || null;

    if (messagesOnly) {
      return NextResponse.json({
        messages: pageRows.map(formatMessageRow),
        totalMessages,
        hasMoreMessages,
        oldestCursor,
      });
    }

    // Definisi karakter diambil dari snapshot percakapan, bukan dari baris terbaru:
    // percakapan tetap bisa dibuka walau karakternya publik milik orang lain,
    // sudah disunting pemiliknya, atau sudah dihapus.
    let character: CharacterRow & { world_name?: string | null };
    let characterDeleted = false;
    try {
      const resolved = await resolveChatCharacter(chat);
      character = resolved.character;
      characterDeleted = resolved.isDeleted;
    } catch {
      return jsonError('Karakter untuk percakapan ini tidak ditemukan.', 404);
    }

    // Nama dunia hanya relevan bila karakternya masih ada
    if (chat.character_id && character.world_id) {
      const world = await queryOne<{ name: string }>('SELECT name FROM worlds WHERE id = $1', [character.world_id]);
      character = { ...character, world_name: world?.name || null };
    }

    const [memories, otherChats, personas, settings] = await Promise.all([
      query(
        `SELECT * FROM memories WHERE user_id = $2 AND (character_id = $1 OR character_id IS NULL)
         ORDER BY created_at DESC`,
        [chat.character_id, user.id]
      ),
      query(
        'SELECT id, title, updated_at FROM chats WHERE character_id = $1 AND user_id = $2 ORDER BY updated_at DESC',
        [chat.character_id, user.id]
      ),
      getAllPersonas(user.id),
      getUserSettings(user.id),
    ]);

    const activePersona = chat.persona_id
      ? await getPersonaById(user.id, chat.persona_id)
      : await getDefaultPersona(user.id);

    const resolvedChat = {
      ...stripOwner(chat),
      persona_id: chat.persona_id || activePersona?.id || null,
      use_latest_persona: Boolean(chat.use_latest_persona),
      temperature: chat.temperature ?? character.temperature_override ?? (parseFloat(settings.temperature || '0.9') || 0.9),
      max_tokens: chat.max_tokens ?? (parseInt(settings.max_tokens || '1024', 10) || 1024),
      reply_style: chat.reply_style || settings.default_reply_style || 'sedang',
    };

    return NextResponse.json({
      chat: resolvedChat,
      character: formatCharacterRow(character),
      // Klien memakai ini untuk menonaktifkan kolom pesan pada percakapan yang karakternya sudah dihapus
      characterDeleted,
      messages: pageRows.map(formatMessageRow),
      totalMessages,
      hasMoreMessages,
      oldestCursor,
      memories: memories.map(sanitizeMemoryForClient),
      otherChats,
      activePersona: formatPersona(activePersona),
      personas: personas.map(formatPersona),
      defaultSettings: {
        temperature: settings.temperature || '0.9',
        max_tokens: settings.max_tokens || '1024',
        default_reply_style: settings.default_reply_style || 'sedang',
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat ruang percakapan.');
  }
}

export async function PATCH(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const body = await readJson(req);
    const existing = await requireOwnedChat(user.id, id);

    // Ringkasan percakapan manual
    if (body.action === 'summarize') {
      enforceLlmRateLimit(user.id);
      const msgs = await query<MessageRow>('SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC', [id]);
      if (msgs.length < 4) {
        return jsonError('Percakapan masih terlalu singkat untuk diringkas (minimal 4 pesan).', 400);
      }

      let charName = 'Karakter';
      try {
        const resolved = await resolveChatCharacter(existing);
        charName = resolved.character.name || 'Karakter';
      } catch {
        // Fallback ke nama generik jika snapshot dan karakter keduanya tidak tersedia
      }
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
          userId: user.id,
          temperature: 0.4,
          maxTokens: 500,
          characterId: existing.character_id,
          chatId: id,
          actionType: 'summary',
        }
      );

      const lastMsgId = msgs[msgs.length - 1]?.id || null;
      const updated = await queryOne<ChatRow>(
        `UPDATE chats SET summary = $1, summarized_until_msg_id = $2, updated_at = now()
         WHERE id = $3 AND user_id = $4 RETURNING *`,
        [sumRes.text, lastMsgId, id, user.id]
      );
      return NextResponse.json({ chat: stripOwner(updated!), summary: sumRes.text });
    }

    const title = body.title !== undefined ? String(body.title).trim().slice(0, 120) : existing.title;
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

    // Persona hanya boleh milik pengguna sendiri; ID asing diabaikan
    let personaId = existing.persona_id || null;
    let personaSnapshot = existing.persona_snapshot;
    if (body.persona_id !== undefined) {
      if (body.persona_id) {
        const owned = await queryOne(
          'SELECT * FROM user_personas WHERE id = $1 AND user_id = $2',
          [String(body.persona_id), user.id]
        );
        if (!owned) return jsonError('Persona tidak ditemukan.', 404);
        personaId = owned.id;
        personaSnapshot = JSON.stringify(stripOwner(owned));
      } else {
        personaId = null;
      }
    }
    const useLatestPersona =
      body.use_latest_persona !== undefined ? (body.use_latest_persona ? 1 : 0) : existing.use_latest_persona;

    const updated = await queryOne<ChatRow>(
      `UPDATE chats SET
         title = $1, summary = $2, temperature = $3, max_tokens = $4, reply_style = $5,
         persona_id = $6, persona_snapshot = $7, use_latest_persona = $8, updated_at = now()
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [
        title || existing.title,
        summary,
        temperature,
        maxTokens,
        replyStyle,
        personaId,
        personaSnapshot,
        useLatestPersona,
        id,
        user.id,
      ]
    );

    const activePersona = personaId ? await getPersonaById(user.id, personaId) : await getDefaultPersona(user.id);
    return NextResponse.json({ chat: stripOwner(updated!), activePersona: formatPersona(activePersona) });
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui pengaturan percakapan.');
  }
}

export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    await requireOwnedChat(user.id, id);
    await execute('DELETE FROM chats WHERE id = $1 AND user_id = $2', [id, user.id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus percakapan.');
  }
}
