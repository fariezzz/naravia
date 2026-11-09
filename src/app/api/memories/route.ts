import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');
    const db = getDb();

    if (characterId) {
      const memories = db
        .prepare(`
          SELECT m.*, c.name as character_name
          FROM memories m
          LEFT JOIN characters c ON m.character_id = c.id
          WHERE m.character_id = ? OR m.character_id IS NULL
          ORDER BY m.created_at DESC
        `)
        .all(characterId);
      return NextResponse.json({ memories });
    }

    const memories = db
      .prepare(`
        SELECT m.*, c.name as character_name
        FROM memories m
        LEFT JOIN characters c ON m.character_id = c.id
        ORDER BY m.created_at DESC
      `)
      .all();

    return NextResponse.json({ memories });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat memori jangka panjang.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const content = String(body.content || '').trim();
    if (!content) {
      return NextResponse.json({ error: 'Isi memori tidak boleh kosong.' }, { status: 400 });
    }

    const db = getDb();
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO memories (id, character_id, type, content, source_chat_id, source_message_id, is_auto, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      body.characterId || null,
      body.type === 'preference' ? 'preference' : 'fact',
      content,
      body.sourceChatId || null,
      body.sourceMessageId || null,
      now
    );

    if (body.sourceMessageId) {
      db.prepare('UPDATE messages SET is_pinned_memory = 1 WHERE id = ?').run(body.sourceMessageId);
    }

    const created = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
    return NextResponse.json({ memory: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan memori.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    const content = String(body.content || '').trim();
    if (!id || !content) {
      return NextResponse.json({ error: 'ID dan isi memori wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('UPDATE memories SET content = ?, type = ? WHERE id = ?').run(
      content,
      body.type === 'preference' ? 'preference' : 'fact',
      id
    );

    const updated = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
    return NextResponse.json({ memory: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui memori.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID memori wajib disertakan.' }, { status: 400 });
    }

    const db = getDb();
    const mem = db.prepare('SELECT source_message_id FROM memories WHERE id = ?').get(id) as
      | { source_message_id?: string | null }
      | undefined;

    if (mem?.source_message_id) {
      db.prepare('UPDATE messages SET is_pinned_memory = 0 WHERE id = ?').run(mem.source_message_id);
    }

    db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus memori.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
