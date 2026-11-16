import { NextRequest, NextResponse } from 'next/server';
import { assertAvatarOwnership, deleteUploadAsset } from '@/lib/assets';
import { requireUser } from '@/lib/auth';
import { queryOne, UserPersonaRow, withTransaction } from '@/lib/db';
import { stripOwner } from '@/lib/format';
import { handleApiError, HttpError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { formatPersona, getAllPersonas, getDefaultPersona } from '@/lib/store';

export const runtime = 'nodejs';

const MAX_PERSONAS_PER_USER = 30;

async function requireOwnedPersona(userId: string, id: string) {
  const row = await queryOne<UserPersonaRow>('SELECT * FROM user_personas WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!row) throw new HttpError(404, 'Persona tidak ditemukan.');
  return row;
}

async function listResponse(userId: string, persona: UserPersonaRow | null, status = 200) {
  const personas = await getAllPersonas(userId);
  return NextResponse.json(
    { persona: formatPersona(persona), personas: personas.map(formatPersona) },
    { status }
  );
}

function limitText(raw: unknown, max: number): string {
  return String(raw || '').trim().slice(0, max);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return listResponse(user.id, await getDefaultPersona(user.id));
  } catch (err) {
    return handleApiError(err, 'Gagal memuat daftar persona pengguna.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const displayName = limitText(body.display_name, 60);
    if (!displayName) return jsonError('Nama panggilan persona wajib diisi.', 400);

    const existing = await getAllPersonas(user.id);
    if (existing.length >= MAX_PERSONAS_PER_USER) {
      return jsonError(`Batas maksimal ${MAX_PERSONAS_PER_USER} persona per akun sudah tercapai.`, 400);
    }

    const isDefault = Boolean(body.is_default) || existing.length === 0;
    const avatar = await assertAvatarOwnership(body.avatar, user.id);
    const id = newId('persona');

    const created = await withTransaction(async (client) => {
      if (isDefault) {
        await client.query('UPDATE user_personas SET is_default = 0 WHERE user_id = $1', [user.id]);
      }
      return queryOne<UserPersonaRow>(
        `INSERT INTO user_personas (id, user_id, display_name, avatar, description, likes, dislikes, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          id,
          user.id,
          displayName,
          avatar,
          limitText(body.description, 4000),
          limitText(body.likes, 1000),
          limitText(body.dislikes, 1000),
          isDefault ? 1 : 0,
        ],
        client
      );
    });

    return listResponse(user.id, created, 201);
  } catch (err) {
    return handleApiError(err, 'Gagal membuat persona baru.');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);

    const fallbackDefault = await getDefaultPersona(user.id);
    const targetId = body.id ? String(body.id) : fallbackDefault?.id;
    if (!targetId) return jsonError('Persona tidak ditemukan.', 404);
    const existing = await requireOwnedPersona(user.id, targetId);

    if (body.action === 'set_default') {
      await withTransaction(async (client) => {
        await client.query('UPDATE user_personas SET is_default = 0 WHERE user_id = $1', [user.id]);
        await client.query(
          'UPDATE user_personas SET is_default = 1, updated_at = now() WHERE id = $1 AND user_id = $2',
          [existing.id, user.id]
        );
      });
      return listResponse(user.id, await requireOwnedPersona(user.id, existing.id));
    }

    const displayName =
      body.display_name !== undefined ? limitText(body.display_name, 60) || 'Kamu' : existing.display_name;
    const avatar = body.avatar !== undefined ? await assertAvatarOwnership(body.avatar, user.id) : existing.avatar || '';
    const description = body.description !== undefined ? limitText(body.description, 4000) : existing.description || '';
    const likes = body.likes !== undefined ? limitText(body.likes, 1000) : existing.likes || '';
    const dislikes = body.dislikes !== undefined ? limitText(body.dislikes, 1000) : existing.dislikes || '';
    const makeDefault = body.is_default !== undefined ? Boolean(body.is_default) : Boolean(existing.is_default);

    const updated = await withTransaction(async (client) => {
      if (makeDefault) {
        await client.query('UPDATE user_personas SET is_default = 0 WHERE user_id = $1', [user.id]);
      }
      const row = await queryOne<UserPersonaRow>(
        `UPDATE user_personas SET
           display_name = $1, avatar = $2, description = $3, likes = $4, dislikes = $5,
           is_default = $6, updated_at = now()
         WHERE id = $7 AND user_id = $8
         RETURNING *`,
        [displayName, avatar, description, likes, dislikes, makeDefault ? 1 : 0, existing.id, user.id],
        client
      );

      if (body.applyToAllChats && row) {
        await client.query(
          'UPDATE chats SET persona_id = $1, persona_snapshot = $2, use_latest_persona = 1 WHERE user_id = $3',
          [row.id, JSON.stringify(stripOwner(row)), user.id]
        );
      }
      return row;
    });

    // Hapus avatar lama milik pengguna jika diganti dan tidak dipakai entitas lain
    if (existing.avatar && existing.avatar !== avatar) {
      await deleteUploadAsset(existing.avatar, user.id);
    }

    return listResponse(user.id, updated);
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui persona pengguna.');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return jsonError('ID persona wajib disertakan.', 400);

    const all = await getAllPersonas(user.id);
    if (all.length <= 1) return jsonError('Minimal harus ada 1 persona pengguna yang tersisa.', 400);
    const target = await requireOwnedPersona(user.id, id);

    await withTransaction(async (client) => {
      await client.query('DELETE FROM user_personas WHERE id = $1 AND user_id = $2', [id, user.id]);

      const remaining = all.filter((p) => p.id !== id);
      let newDefaultId = remaining.find((p) => p.is_default)?.id || null;
      if (target.is_default || !newDefaultId) {
        newDefaultId = remaining[0].id;
        await client.query('UPDATE user_personas SET is_default = 1 WHERE id = $1 AND user_id = $2', [
          newDefaultId,
          user.id,
        ]);
      }

      await client.query('UPDATE chats SET persona_id = $1 WHERE persona_id = $2 AND user_id = $3', [
        newDefaultId,
        id,
        user.id,
      ]);
      await client.query('UPDATE group_chats SET persona_id = $1 WHERE persona_id = $2 AND user_id = $3', [
        newDefaultId,
        id,
        user.id,
      ]);
    });

    if (target.avatar) await deleteUploadAsset(target.avatar, user.id);

    return listResponse(user.id, await getDefaultPersona(user.id));
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus persona.');
  }
}
