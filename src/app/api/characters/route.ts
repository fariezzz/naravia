import { NextRequest, NextResponse } from 'next/server';
import { CharacterRow, formatCharacterRow, getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const rows = (db
      .prepare(`
        SELECT
          c.*,
          w.name as world_name,
          COUNT(ch.id) as chat_count,
          MAX(ch.updated_at) as last_chat_at
        FROM characters c
        LEFT JOIN worlds w ON c.world_id = w.id
        LEFT JOIN chats ch ON ch.character_id = c.id
        GROUP BY c.id
        ORDER BY c.is_pinned DESC, COALESCE(MAX(ch.updated_at), c.updated_at) DESC
      `)
      .all() as unknown) as Array<CharacterRow & { chat_count: number; last_chat_at: string | null; world_name: string | null }>;

    return NextResponse.json({
      characters: rows.map(formatCharacterRow),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat daftar karakter.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Nama karakter wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const id = `char-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const greetings = Array.isArray(body.greeting)
      ? body.greeting.map((g: unknown) => String(g || '').trim()).filter(Boolean)
      : typeof body.greeting === 'string' && body.greeting.trim()
      ? [body.greeting.trim()]
      : [`Halo, aku ${name}. Senang bisa mengobrol denganmu.`];

    const exampleDialogues = Array.isArray(body.example_dialogues)
      ? body.example_dialogues
          .map((d: any) => ({
            user: String(d?.user || '').trim(),
            char: String(d?.char || '').trim(),
          }))
          .filter((d: { user: string; char: string }) => d.user || d.char)
      : [];

    const tags = Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t || '').trim()).filter(Boolean)
      : [];

    const researchNotes =
      typeof body.research_notes === 'object' && body.research_notes !== null
        ? JSON.stringify(body.research_notes)
        : String(body.research_notes || '');

    db.prepare(`
      INSERT INTO characters (
        id, name, tagline, avatar, description, personality, speaking_style,
        scenario, greeting, example_dialogues, tags, research_notes, world_id,
        is_pinned, is_favorite, temperature_override, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      String(body.tagline || '').trim(),
      String(body.avatar || '').trim(),
      String(body.description || '').trim(),
      String(body.personality || '').trim(),
      String(body.speaking_style || '').trim(),
      String(body.scenario || '').trim(),
      JSON.stringify(greetings),
      JSON.stringify(exampleDialogues),
      JSON.stringify(tags),
      researchNotes,
      body.world_id || null,
      body.is_pinned ? 1 : 0,
      body.is_favorite ? 1 : 0,
      body.temperature_override !== undefined && body.temperature_override !== null && body.temperature_override !== ''
        ? Number(body.temperature_override)
        : null,
      now,
      now
    );

    const created = (db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as unknown) as CharacterRow;
    return NextResponse.json({ character: formatCharacterRow(created) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan karakter baru.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
