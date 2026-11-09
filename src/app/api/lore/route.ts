import { NextRequest, NextResponse } from 'next/server';
import { getDb, LoreEntryRow } from '@/lib/db';

function formatLore(l: LoreEntryRow) {
  let keywords: string[] = [];
  try {
    keywords = JSON.parse(l.keywords || '[]');
  } catch {
    keywords = [];
  }
  return {
    id: l.id,
    world_id: l.world_id,
    title: l.title,
    keywords,
    content: l.content,
    enabled: Boolean(l.enabled),
    created_at: l.created_at,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const worldId = String(body.world_id || '').trim();
    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();
    const keywords = Array.isArray(body.keywords)
      ? body.keywords.map((k: unknown) => String(k || '').trim()).filter(Boolean)
      : String(body.keywords || '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);

    if (!worldId || !content || keywords.length === 0) {
      return NextResponse.json(
        { error: 'Dunia, kata kunci pemicu, dan isi penjelasan lore wajib diisi.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const id = `lore-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO lore_entries (id, world_id, title, keywords, content, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, worldId, title || keywords[0], JSON.stringify(keywords), content, now);

    const created = (db.prepare('SELECT * FROM lore_entries WHERE id = ?').get(id) as unknown) as LoreEntryRow;
    return NextResponse.json({ entry: formatLore(created) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menambah entri lorebook.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'ID entri lore wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const existing = (db.prepare('SELECT * FROM lore_entries WHERE id = ?').get(id) as unknown) as LoreEntryRow | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Entri lore tidak ditemukan.' }, { status: 404 });
    }

    const keywords =
      body.keywords !== undefined
        ? JSON.stringify(
            Array.isArray(body.keywords)
              ? body.keywords.map((k: unknown) => String(k || '').trim()).filter(Boolean)
              : String(body.keywords || '')
                  .split(',')
                  .map((k) => k.trim())
                  .filter(Boolean)
          )
        : existing.keywords;

    db.prepare(`
      UPDATE lore_entries SET
        title = ?,
        keywords = ?,
        content = ?,
        enabled = ?
      WHERE id = ?
    `).run(
      body.title !== undefined ? String(body.title).trim() : existing.title,
      keywords,
      body.content !== undefined ? String(body.content).trim() : existing.content,
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
      id
    );

    const updated = (db.prepare('SELECT * FROM lore_entries WHERE id = ?').get(id) as unknown) as LoreEntryRow;
    return NextResponse.json({ entry: formatLore(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui entri lorebook.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID entri lore wajib disertakan.' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('DELETE FROM lore_entries WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus entri lorebook.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
