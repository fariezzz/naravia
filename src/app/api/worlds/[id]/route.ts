import { NextRequest, NextResponse } from 'next/server';
import { formatWorldRow, getDb, LoreEntryRow, WorldRow } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const db = getDb();

    const existing = (db.prepare('SELECT * FROM worlds WHERE id = ?').get(id) as unknown) as WorldRow | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Dunia tidak ditemukan.' }, { status: 404 });
    }

    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) {
      return NextResponse.json({ error: 'Nama dunia tidak boleh kosong.' }, { status: 400 });
    }

    db.prepare(`
      UPDATE worlds SET
        name = ?,
        description = ?,
        rules = ?,
        places = ?,
        factions = ?,
        timeline = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      name,
      body.description !== undefined ? String(body.description).trim() : existing.description,
      body.rules !== undefined ? String(body.rules).trim() : existing.rules,
      body.places !== undefined ? JSON.stringify(body.places) : existing.places,
      body.factions !== undefined ? JSON.stringify(body.factions) : existing.factions,
      body.timeline !== undefined ? JSON.stringify(body.timeline) : existing.timeline,
      new Date().toISOString(),
      id
    );

    const updated = (db.prepare('SELECT * FROM worlds WHERE id = ?').get(id) as unknown) as WorldRow;
    const lore = (db.prepare('SELECT * FROM lore_entries WHERE world_id = ?').all(id) as unknown) as LoreEntryRow[];
    const chars = db.prepare('SELECT id, name, tagline, avatar FROM characters WHERE world_id = ?').all(id);

    return NextResponse.json({ world: formatWorldRow(updated, lore, chars) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui dunia.';
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
    db.prepare('UPDATE characters SET world_id = NULL WHERE world_id = ?').run(id);
    db.prepare('DELETE FROM worlds WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus dunia.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
