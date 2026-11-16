import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { execute, MemoryRow, query, queryOne } from '@/lib/db';
import { stripOwner } from '@/lib/format';
import { handleApiError, HttpError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { requireOwnedCharacter, requireOwnedChat, requireOwnedMessage } from '@/lib/store';

export const runtime = 'nodejs';

const MAX_MEMORY_LENGTH = 2000;

async function requireOwnedMemory(userId: string, id: string) {
  const row = await queryOne<MemoryRow>('SELECT * FROM memories WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!row) throw new HttpError(404, 'Memori tidak ditemukan.');
  return row;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const characterId = new URL(req.url).searchParams.get('characterId');

    const memories = characterId
      ? await query(
          `SELECT m.*, c.name AS character_name
           FROM memories m
           LEFT JOIN characters c ON m.character_id = c.id
           WHERE m.user_id = $1 AND (m.character_id = $2 OR m.character_id IS NULL)
           ORDER BY m.created_at DESC`,
          [user.id, characterId]
        )
      : await query(
          `SELECT m.*, c.name AS character_name
           FROM memories m
           LEFT JOIN characters c ON m.character_id = c.id
           WHERE m.user_id = $1
           ORDER BY m.created_at DESC`,
          [user.id]
        );

    return NextResponse.json({ memories: memories.map(stripOwner) });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat memori jangka panjang.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const content = String(body.content || '').trim();
    if (!content) return jsonError('Isi memori tidak boleh kosong.', 400);
    if (content.length > MAX_MEMORY_LENGTH) return jsonError('Isi memori terlalu panjang.', 400);

    // Semua referensi wajib milik pengguna sendiri
    const characterId = body.characterId ? (await requireOwnedCharacter(user.id, String(body.characterId))).id : null;
    const sourceChatId = body.sourceChatId ? (await requireOwnedChat(user.id, String(body.sourceChatId))).id : null;
    const sourceMessageId = body.sourceMessageId
      ? (await requireOwnedMessage(user.id, String(body.sourceMessageId))).id
      : null;

    const created = await queryOne<MemoryRow>(
      `INSERT INTO memories (id, user_id, character_id, type, content, source_chat_id, source_message_id, is_auto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0) RETURNING *`,
      [
        newId('mem'),
        user.id,
        characterId,
        body.type === 'preference' ? 'preference' : 'fact',
        content,
        sourceChatId,
        sourceMessageId,
      ]
    );

    if (sourceMessageId) {
      await execute('UPDATE messages SET is_pinned_memory = 1 WHERE id = $1', [sourceMessageId]);
    }

    return NextResponse.json({ memory: stripOwner(created!) }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal menyimpan memori.');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const id = String(body.id || '').trim();
    const content = String(body.content || '').trim();
    if (!id || !content) return jsonError('ID dan isi memori wajib diisi.', 400);
    if (content.length > MAX_MEMORY_LENGTH) return jsonError('Isi memori terlalu panjang.', 400);

    await requireOwnedMemory(user.id, id);
    const updated = await queryOne<MemoryRow>(
      'UPDATE memories SET content = $1, type = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [content, body.type === 'preference' ? 'preference' : 'fact', id, user.id]
    );
    return NextResponse.json({ memory: stripOwner(updated!) });
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui memori.');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return jsonError('ID memori wajib disertakan.', 400);

    const mem = await requireOwnedMemory(user.id, id);
    if (mem.source_message_id) {
      await execute(
        `UPDATE messages SET is_pinned_memory = 0
         WHERE id = $1 AND chat_id IN (SELECT id FROM chats WHERE user_id = $2)`,
        [mem.source_message_id, user.id]
      );
    }
    await execute('DELETE FROM memories WHERE id = $1 AND user_id = $2', [id, user.id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus memori.');
  }
}
