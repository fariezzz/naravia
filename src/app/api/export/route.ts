import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { stripOwner } from '@/lib/format';
import { getClientIp, handleApiError } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { logAudit } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Unduh salinan seluruh data milik akun ini dalam format JSON (pengganti cadangan file database)
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    enforceRateLimit(`export:${user.id}`, 10, 60 * 60_000);

    const [characters, worlds, lore, personas, chats, messages, memories, groupChats, groupMembers, groupMessages] =
      await Promise.all([
        query('SELECT * FROM characters WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
        query('SELECT * FROM worlds WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
        query(
          `SELECT l.* FROM lore_entries l JOIN worlds w ON w.id = l.world_id WHERE w.user_id = $1 ORDER BY l.created_at ASC`,
          [user.id]
        ),
        query('SELECT * FROM user_personas WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
        query('SELECT * FROM chats WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
        query(
          `SELECT m.* FROM messages m JOIN chats c ON c.id = m.chat_id WHERE c.user_id = $1 ORDER BY m.created_at ASC`,
          [user.id]
        ),
        query('SELECT * FROM memories WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
        query('SELECT * FROM group_chats WHERE user_id = $1 ORDER BY created_at ASC', [user.id]),
        query(
          `SELECT gm.* FROM group_chat_members gm JOIN group_chats g ON g.id = gm.group_chat_id WHERE g.user_id = $1`,
          [user.id]
        ),
        query(
          `SELECT gm.* FROM group_messages gm JOIN group_chats g ON g.id = gm.group_chat_id
           WHERE g.user_id = $1 ORDER BY gm.created_at ASC`,
          [user.id]
        ),
      ]);

    const payload = {
      format: 'naravia-export',
      version: 1,
      exported_at: new Date().toISOString(),
      account: { email: user.email, display_name: user.display_name },
      characters: characters.map(stripOwner),
      worlds: worlds.map(stripOwner),
      lore_entries: lore,
      personas: personas.map(stripOwner),
      chats: chats.map(stripOwner),
      messages,
      memories: memories.map(stripOwner),
      group_chats: groupChats.map(stripOwner),
      group_chat_members: groupMembers,
      group_messages: groupMessages,
    };

    await logAudit({ userId: user.id, actorEmail: user.email, action: 'ekspor_data', ip: getClientIp(req) });

    const dateStr = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="naravia-data-${dateStr}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal mengekspor data.');
  }
}
