import { NextRequest, NextResponse } from 'next/server';
import { CharacterRow, getDb, GroupChatRow } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const groups = (db
      .prepare('SELECT * FROM group_chats ORDER BY updated_at DESC')
      .all() as unknown) as GroupChatRow[];

    const enriched = groups.map((g) => {
      const members = db
        .prepare(`
          SELECT c.id, c.name, c.tagline, c.avatar, gm.join_order
          FROM group_chat_members gm
          JOIN characters c ON gm.character_id = c.id
          WHERE gm.group_chat_id = ?
          ORDER BY gm.join_order ASC
        `)
        .all(g.id);

      const msgCount = db
        .prepare('SELECT COUNT(*) as cnt FROM group_messages WHERE group_chat_id = ?')
        .get(g.id) as { cnt: number };

      return {
        ...g,
        members,
        message_count: Number(msgCount?.cnt || 0),
      };
    });

    return NextResponse.json({ groupChats: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memuat daftar grup chat.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body.title || '').trim();
    const scenario = String(body.scenario || '').trim();
    const characterIds: string[] = Array.isArray(body.characterIds)
      ? body.characterIds.map(String).filter(Boolean)
      : [];

    if (characterIds.length < 2) {
      return NextResponse.json(
        { error: 'Pilih minimal 2 karakter untuk membuat Grup Chat.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const id = `gchat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const chars = characterIds
      .map((cid) => (db.prepare('SELECT * FROM characters WHERE id = ?').get(cid) as unknown) as CharacterRow | undefined)
      .filter((c): c is CharacterRow => Boolean(c));

    const resolvedTitle = title || `Grup: ${chars.map((c) => c.name).join(', ')}`;

    db.prepare(`
      INSERT INTO group_chats (id, title, scenario, turn_mode, last_speaker_id, temperature, max_tokens, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, 0.9, 1024, ?, ?)
    `).run(id, resolvedTitle, scenario, body.turn_mode || 'auto', now, now);

    const insertMember = db.prepare(`
      INSERT INTO group_chat_members (group_chat_id, character_id, join_order)
      VALUES (?, ?, ?)
    `);

    chars.forEach((c, idx) => {
      insertMember.run(id, c.id, idx);
    });

    const created = db.prepare('SELECT * FROM group_chats WHERE id = ?').get(id);
    return NextResponse.json({ groupChat: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal membuat grup chat.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
