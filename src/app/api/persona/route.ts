import { NextRequest, NextResponse } from 'next/server';
import {
  ensureMultiPersonaSchema,
  getAllPersonas,
  getDb,
  getDefaultPersona,
  getPersonaById,
  invalidatePersonasCache,
  UserPersonaRow,
} from '@/lib/db';
import { deleteUploadAsset, replaceUploadAsset } from '@/lib/assets';

function syncDefaultToLegacyTable(persona: UserPersonaRow | null) {
  if (!persona) return;
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO user_persona (id, display_name, avatar, description, likes, dislikes, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        avatar = excluded.avatar,
        description = excluded.description,
        likes = excluded.likes,
        dislikes = excluded.dislikes,
        updated_at = excluded.updated_at
    `).run(
      persona.display_name,
      persona.avatar || '',
      persona.description || '',
      persona.likes || '',
      persona.dislikes || '',
      persona.updated_at
    );
  } catch {
    // Abaikan jika gagal sinkronisasi ke tabel lama
  }
}

export async function GET() {
  try {
    ensureMultiPersonaSchema();
    const personas = getAllPersonas().map((p) => ({
      ...p,
      is_default: Boolean(p.is_default),
    }));
    const defaultPersona = personas.find((p) => p.is_default) || personas[0] || null;

    return NextResponse.json({
      persona: defaultPersona,
      personas,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat daftar persona pengguna.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureMultiPersonaSchema();
    const body = await req.json();
    const displayName = String(body.display_name || '').trim();
    if (!displayName) {
      return NextResponse.json({ error: 'Nama panggilan persona wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const id = `persona-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const isDefault = Boolean(body.is_default);

    if (isDefault) {
      db.prepare('UPDATE user_personas SET is_default = 0').run();
    }

    db.prepare(`
      INSERT INTO user_personas (id, display_name, avatar, description, likes, dislikes, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      displayName,
      String(body.avatar || '').trim(),
      String(body.description || '').trim(),
      String(body.likes || '').trim(),
      String(body.dislikes || '').trim(),
      isDefault ? 1 : 0,
      now,
      now
    );

    invalidatePersonasCache();
    const created = getPersonaById(id);
    if (isDefault && created) {
      syncDefaultToLegacyTable(created);
    }

    const personas = getAllPersonas().map((p) => ({
      ...p,
      is_default: Boolean(p.is_default),
    }));

    return NextResponse.json(
      {
        persona: created ? { ...created, is_default: Boolean(created.is_default) } : null,
        personas,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal membuat persona baru.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    ensureMultiPersonaSchema();
    const body = await req.json();
    const db = getDb();
    const now = new Date().toISOString();

    const targetId = body.id ? String(body.id) : getDefaultPersona()?.id || 'persona-default';
    const existing = getPersonaById(targetId);
    if (!existing) {
      return NextResponse.json({ error: 'Persona tidak ditemukan.' }, { status: 404 });
    }

    if (body.action === 'set_default') {
      db.prepare('UPDATE user_personas SET is_default = 0').run();
      db.prepare('UPDATE user_personas SET is_default = 1, updated_at = ? WHERE id = ?').run(
        now,
        existing.id
      );
      invalidatePersonasCache();
      const updatedDefault = getPersonaById(existing.id);
      syncDefaultToLegacyTable(updatedDefault);

      const personas = getAllPersonas().map((p) => ({
        ...p,
        is_default: Boolean(p.is_default),
      }));
      return NextResponse.json({
        persona: updatedDefault ? { ...updatedDefault, is_default: true } : null,
        personas,
      });
    }

    const displayName =
      body.display_name !== undefined
        ? String(body.display_name).trim() || 'Kamu'
        : existing.display_name;
    const avatar = body.avatar !== undefined ? String(body.avatar).trim() : existing.avatar || '';
    const description =
      body.description !== undefined ? String(body.description).trim() : existing.description || '';
    const likes = body.likes !== undefined ? String(body.likes).trim() : existing.likes || '';
    const dislikes =
      body.dislikes !== undefined ? String(body.dislikes).trim() : existing.dislikes || '';
    const makeDefault =
      body.is_default !== undefined ? Boolean(body.is_default) : Boolean(existing.is_default);

    if (makeDefault) {
      db.prepare('UPDATE user_personas SET is_default = 0').run();
    }

    db.prepare(`
      UPDATE user_personas SET
        display_name = ?,
        avatar = ?,
        description = ?,
        likes = ?,
        dislikes = ?,
        is_default = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      displayName,
      avatar,
      description,
      likes,
      dislikes,
      makeDefault ? 1 : 0,
      now,
      existing.id
    );

    // Hapus file avatar persona lama jika diganti dengan yang baru
    if (existing.avatar && avatar && existing.avatar !== avatar) {
      replaceUploadAsset(existing.avatar, avatar);
    }

    invalidatePersonasCache();
    const updated = getPersonaById(existing.id);
    if (updated && updated.is_default) {
      syncDefaultToLegacyTable(updated);
    }

    if (body.applyToAllChats && updated) {
      db.prepare('UPDATE chats SET persona_id = ?, persona_snapshot = ?, use_latest_persona = 1').run(
        updated.id,
        JSON.stringify(updated)
      );
    }

    const personas = getAllPersonas().map((p) => ({
      ...p,
      is_default: Boolean(p.is_default),
    }));

    return NextResponse.json({
      persona: updated ? { ...updated, is_default: Boolean(updated.is_default) } : null,
      personas,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui persona pengguna.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    ensureMultiPersonaSchema();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID persona wajib disertakan.' }, { status: 400 });
    }

    const all = getAllPersonas();
    if (all.length <= 1) {
      return NextResponse.json(
        { error: 'Minimal harus ada 1 persona pengguna yang tersisa.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const target = all.find((p) => p.id === id);
    db.prepare('DELETE FROM user_personas WHERE id = ?').run(id);
    invalidatePersonasCache();

    // Hapus fisik aset avatar persona jika tidak digunakan oleh karakter atau persona lain
    if (target?.avatar) {
      deleteUploadAsset(target.avatar);
    }

    const remaining = getAllPersonas();
    if (target?.is_default && remaining.length > 0) {
      db.prepare('UPDATE user_personas SET is_default = 1 WHERE id = ?').run(remaining[0].id);
      syncDefaultToLegacyTable(remaining[0]);
    }

    const newDefault = getDefaultPersona();
    if (newDefault) {
      db.prepare('UPDATE chats SET persona_id = ? WHERE persona_id = ?').run(newDefault.id, id);
      db.prepare('UPDATE group_chats SET persona_id = ? WHERE persona_id = ?').run(newDefault.id, id);
    }

    const personas = getAllPersonas().map((p) => ({
      ...p,
      is_default: Boolean(p.is_default),
    }));

    return NextResponse.json({
      persona: getDefaultPersona(),
      personas,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus persona.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
