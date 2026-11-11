import { NextRequest, NextResponse } from 'next/server';
import { CharacterRow, formatCharacterRow, getDb } from '@/lib/db';
import { deleteUploadAsset, replaceUploadAsset } from '@/lib/assets';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = getDb();

    const row = (db
      .prepare(`
        SELECT
          c.*,
          w.name as world_name,
          COUNT(ch.id) as chat_count,
          MAX(ch.updated_at) as last_chat_at
        FROM characters c
        LEFT JOIN worlds w ON c.world_id = w.id
        LEFT JOIN chats ch ON ch.character_id = c.id
        WHERE c.id = ?
        GROUP BY c.id
      `)
      .get(id) as unknown) as (CharacterRow & { chat_count: number; last_chat_at: string | null; world_name: string | null }) | undefined;

    if (!row) {
      return NextResponse.json({ error: 'Karakter tidak ditemukan.' }, { status: 404 });
    }

    const chats = db
      .prepare(`
        SELECT ch.*, COUNT(m.id) as message_count
        FROM chats ch
        LEFT JOIN messages m ON m.chat_id = ch.id
        WHERE ch.character_id = ?
        GROUP BY ch.id
        ORDER BY ch.updated_at DESC
      `)
      .all(id);

    const memories = db
      .prepare('SELECT * FROM memories WHERE character_id = ? OR character_id IS NULL ORDER BY created_at DESC')
      .all(id);

    return NextResponse.json({
      character: formatCharacterRow(row),
      chats,
      memories,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat profil karakter.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const db = getDb();

    const existing = (db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as unknown) as CharacterRow | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Karakter tidak ditemukan.' }, { status: 404 });
    }

    // Jika aksi duplikat karakter
    if (body.action === 'duplicate') {
      const now = new Date().toISOString();
      const newId = `char-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const dupName = `${existing.name} (Salinan)`;

      db.prepare(`
        INSERT INTO characters (
          id, name, tagline, avatar, description, personality, speaking_style,
          scenario, greeting, example_dialogues, tags, research_notes, world_id,
          is_pinned, is_favorite, temperature_override, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId,
        dupName,
        existing.tagline,
        existing.avatar,
        existing.description,
        existing.personality,
        existing.speaking_style,
        existing.scenario,
        existing.greeting,
        existing.example_dialogues,
        existing.tags,
        existing.research_notes,
        existing.world_id,
        0,
        existing.is_favorite,
        existing.temperature_override,
        now,
        now
      );

      const duplicated = (db.prepare('SELECT * FROM characters WHERE id = ?').get(newId) as unknown) as CharacterRow;
      return NextResponse.json({ character: formatCharacterRow(duplicated) });
    }

    const now = new Date().toISOString();
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) {
      return NextResponse.json({ error: 'Nama karakter tidak boleh kosong.' }, { status: 400 });
    }

    const greetings =
      body.greeting !== undefined
        ? JSON.stringify(
            Array.isArray(body.greeting)
              ? body.greeting.map((g: unknown) => String(g || '').trim()).filter(Boolean)
              : [String(body.greeting).trim()].filter(Boolean)
          )
        : existing.greeting;

    const exampleDialogues =
      body.example_dialogues !== undefined
        ? JSON.stringify(
            Array.isArray(body.example_dialogues)
              ? body.example_dialogues
                  .map((d: any) => ({
                    user: String(d?.user || '').trim(),
                    char: String(d?.char || '').trim(),
                  }))
                  .filter((d: { user: string; char: string }) => d.user || d.char)
              : []
          )
        : existing.example_dialogues;

    const tags =
      body.tags !== undefined
        ? JSON.stringify(
            Array.isArray(body.tags)
              ? body.tags.map((t: unknown) => String(t || '').trim()).filter(Boolean)
              : []
          )
        : existing.tags;

    const researchNotes =
      body.research_notes !== undefined
        ? typeof body.research_notes === 'object' && body.research_notes !== null
          ? JSON.stringify(body.research_notes)
          : String(body.research_notes || '')
        : existing.research_notes;

    const oldAvatar = existing.avatar;
    const newAvatar = body.avatar !== undefined ? String(body.avatar).trim() : existing.avatar;

    db.prepare(`
      UPDATE characters SET
        name = ?,
        tagline = ?,
        avatar = ?,
        description = ?,
        personality = ?,
        speaking_style = ?,
        scenario = ?,
        greeting = ?,
        example_dialogues = ?,
        tags = ?,
        research_notes = ?,
        world_id = ?,
        is_pinned = ?,
        is_favorite = ?,
        temperature_override = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
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
      body.world_id !== undefined ? body.world_id || null : existing.world_id,
      body.is_pinned !== undefined ? (body.is_pinned ? 1 : 0) : existing.is_pinned,
      body.is_favorite !== undefined ? (body.is_favorite ? 1 : 0) : existing.is_favorite,
      body.temperature_override !== undefined
        ? body.temperature_override === null || body.temperature_override === ''
          ? null
          : Number(body.temperature_override)
        : existing.temperature_override,
      now,
      id
    );

    // Hapus file avatar lama jika pengguna mengganti foto profil karakter
    if (oldAvatar && newAvatar && oldAvatar !== newAvatar) {
      replaceUploadAsset(oldAvatar, newAvatar);
    }

    const updated = (db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as unknown) as CharacterRow;
    return NextResponse.json({ character: formatCharacterRow(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui karakter.';
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
    const existing = db
      .prepare('SELECT avatar FROM characters WHERE id = ?')
      .get(id) as { avatar?: string } | undefined;

    db.prepare('DELETE FROM memories WHERE character_id = ?').run(id);
    db.prepare('DELETE FROM characters WHERE id = ?').run(id);

    // Hapus file fisik avatar dari disk jika tidak digunakan oleh entitas lain
    if (existing?.avatar) {
      deleteUploadAsset(existing.avatar);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus karakter.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
