import { NextRequest, NextResponse } from 'next/server';
import { formatWorldRow, getDb, LoreEntryRow, WorldRow } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const worlds = (db
      .prepare('SELECT * FROM worlds ORDER BY updated_at DESC')
      .all() as unknown) as WorldRow[];

    const result = worlds.map((w) => {
      const lore = (db
        .prepare('SELECT * FROM lore_entries WHERE world_id = ? ORDER BY created_at ASC')
        .all(w.id) as unknown) as LoreEntryRow[];
      const chars = db
        .prepare('SELECT id, name, tagline, avatar FROM characters WHERE world_id = ? ORDER BY name ASC')
        .all(w.id);
      return formatWorldRow(w, lore, chars);
    });

    return NextResponse.json({ worlds: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat daftar dunia.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Nama dunia wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const id = `world-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO worlds (id, name, description, rules, places, factions, timeline, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      String(body.description || '').trim(),
      String(body.rules || '').trim(),
      JSON.stringify(Array.isArray(body.places) ? body.places : []),
      JSON.stringify(Array.isArray(body.factions) ? body.factions : []),
      JSON.stringify(Array.isArray(body.timeline) ? body.timeline : []),
      now,
      now
    );

    const created = (db.prepare('SELECT * FROM worlds WHERE id = ?').get(id) as unknown) as WorldRow;
    return NextResponse.json({ world: formatWorldRow(created) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal membuat dunia baru.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
