import { NextRequest, NextResponse } from 'next/server';
import { assertAvatarOwnership, deleteUploadAsset } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import {
  normalizeExampleDialogues,
  normalizeGreetings,
  normalizeResearchNotes,
  normalizeTags,
  normalizeTemperature,
} from '@/lib/characterInput';
import { CharacterRow, execute, query, queryOne } from '@/lib/db';
import { formatCharacterRow, stripOwner } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { requireOwnedCharacter, resolveOwnedWorldId } from '@/lib/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;

    const row = await queryOne<CharacterRow & { chat_count: number; last_chat_at: string | null; world_name: string | null }>(
      `SELECT c.*, w.name AS world_name, COUNT(ch.id) AS chat_count, MAX(ch.updated_at) AS last_chat_at
       FROM characters c
       LEFT JOIN worlds w ON c.world_id = w.id
       LEFT JOIN chats ch ON ch.character_id = c.id
       WHERE c.id = $1 AND c.user_id = $2
       GROUP BY c.id, w.name`,
      [id, user.id]
    );
    if (!row) return jsonError('Karakter tidak ditemukan.', 404);

    const chats = await query(
      `SELECT ch.*, COUNT(m.id) AS message_count
       FROM chats ch
       LEFT JOIN messages m ON m.chat_id = ch.id
       WHERE ch.character_id = $1 AND ch.user_id = $2
       GROUP BY ch.id
       ORDER BY ch.updated_at DESC`,
      [id, user.id]
    );

    const memories = await query(
      `SELECT * FROM memories
       WHERE user_id = $2 AND (character_id = $1 OR character_id IS NULL)
       ORDER BY created_at DESC`,
      [id, user.id]
    );

    return NextResponse.json({
      character: formatCharacterRow(row),
      chats: chats.map(stripOwner),
      memories: memories.map(stripOwner),
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat profil karakter.');
  }
}

export async function PUT(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const body = await readJson(req);
    const existing = await requireOwnedCharacter(user.id, id);

    // Duplikat karakter milik sendiri
    if (body.action === 'duplicate') {
      const duplicated = await queryOne<CharacterRow>(
        `INSERT INTO characters (
           id, user_id, name, tagline, avatar, description, personality, speaking_style,
           scenario, greeting, example_dialogues, tags, research_notes, world_id,
           is_pinned, is_favorite, temperature_override
         )
         SELECT $1, user_id, name || ' (Salinan)', tagline, avatar, description, personality, speaking_style,
           scenario, greeting, example_dialogues, tags, research_notes, world_id,
           0, is_favorite, temperature_override
         FROM characters WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [newId('char'), id, user.id]
      );
      return NextResponse.json({ character: formatCharacterRow(duplicated!) });
    }

    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) return jsonError('Nama karakter tidak boleh kosong.', 400);
    if (name.length > 120) return jsonError('Nama karakter maksimal 120 karakter.', 400);

    const greetings =
      body.greeting !== undefined ? JSON.stringify(normalizeGreetings(body.greeting)) : existing.greeting;
    const exampleDialogues =
      body.example_dialogues !== undefined
        ? JSON.stringify(normalizeExampleDialogues(body.example_dialogues))
        : existing.example_dialogues;
    const tags = body.tags !== undefined ? JSON.stringify(normalizeTags(body.tags)) : existing.tags;
    const researchNotes =
      body.research_notes !== undefined ? normalizeResearchNotes(body.research_notes) : existing.research_notes;

    const oldAvatar = existing.avatar;
    const newAvatar = body.avatar !== undefined ? await assertAvatarOwnership(body.avatar, user.id) : existing.avatar;
    const worldId = body.world_id !== undefined ? await resolveOwnedWorldId(user.id, body.world_id) : existing.world_id;

    const updated = await queryOne<CharacterRow>(
      `UPDATE characters SET
         name = $1, tagline = $2, avatar = $3, description = $4, personality = $5,
         speaking_style = $6, scenario = $7, greeting = $8, example_dialogues = $9, tags = $10,
         research_notes = $11, world_id = $12, is_pinned = $13, is_favorite = $14,
         temperature_override = $15, updated_at = now()
       WHERE id = $16 AND user_id = $17
       RETURNING *`,
      [
        name,
        body.tagline !== undefined ? String(body.tagline).trim() : existing.tagline,
        newAvatar,
        body.description !== undefined ? String(body.description).trim() : existing.description,
        body.personality !== undefined ? String(body.personality).trim() : existing.personality,
        body.speaking_style !== undefined ? String(body.speaking_style).trim() : existing.speaking_style,
        body.scenario !== undefined ? String(body.scenario).trim() : existing.scenario,
        greetings,
        exampleDialogues,
        tags,
        researchNotes,
        worldId,
        body.is_pinned !== undefined ? (body.is_pinned ? 1 : 0) : existing.is_pinned,
        body.is_favorite !== undefined ? (body.is_favorite ? 1 : 0) : existing.is_favorite,
        body.temperature_override !== undefined
          ? normalizeTemperature(body.temperature_override)
          : existing.temperature_override,
        id,
        user.id,
      ]
    );

    // Hapus file avatar lama jika pengguna mengganti foto profil karakter
    // deleteUploadAsset tetap menolak menghapus file yang masih dirujuk entitas lain
    if (oldAvatar && oldAvatar !== newAvatar) {
      await deleteUploadAsset(oldAvatar, user.id);
    }

    return NextResponse.json({ character: formatCharacterRow(updated!) });
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui karakter.');
  }
}

export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const existing = await requireOwnedCharacter(user.id, id);

    // Memori, chat, dan keanggotaan grup ikut terhapus lewat ON DELETE CASCADE
    await execute('DELETE FROM characters WHERE id = $1 AND user_id = $2', [id, user.id]);

    if (existing.avatar) {
      await deleteUploadAsset(existing.avatar, user.id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus karakter.');
  }
}
