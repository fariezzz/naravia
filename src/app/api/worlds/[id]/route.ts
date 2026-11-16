import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { execute, LoreEntryRow, query, queryOne, WorldRow } from '@/lib/db';
import { formatWorldRow } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { requireOwnedWorld } from '@/lib/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    const body = await readJson(req);
    const existing = await requireOwnedWorld(user.id, id);

    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) return jsonError('Nama dunia tidak boleh kosong.', 400);

    const updated = await queryOne<WorldRow>(
      `UPDATE worlds SET
         name = $1, description = $2, rules = $3, places = $4, factions = $5, timeline = $6, updated_at = now()
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [
        name.slice(0, 120),
        body.description !== undefined ? String(body.description).trim() : existing.description,
        body.rules !== undefined ? String(body.rules).trim() : existing.rules,
        body.places !== undefined ? JSON.stringify(Array.isArray(body.places) ? body.places : []) : existing.places,
        body.factions !== undefined ? JSON.stringify(Array.isArray(body.factions) ? body.factions : []) : existing.factions,
        body.timeline !== undefined ? JSON.stringify(Array.isArray(body.timeline) ? body.timeline : []) : existing.timeline,
        id,
        user.id,
      ]
    );

    const [lore, chars] = await Promise.all([
      query<LoreEntryRow>('SELECT * FROM lore_entries WHERE world_id = $1 ORDER BY created_at ASC', [id]),
      query('SELECT id, name, tagline, avatar FROM characters WHERE world_id = $1 AND user_id = $2', [id, user.id]),
    ]);

    return NextResponse.json({ world: formatWorldRow(updated!, lore, chars) });
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui dunia.');
  }
}

export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    const user = await requireUser(req);
    const { id } = await context.params;
    await requireOwnedWorld(user.id, id);
    // characters.world_id otomatis menjadi NULL lewat ON DELETE SET NULL; lore ikut terhapus (CASCADE)
    await execute('DELETE FROM worlds WHERE id = $1 AND user_id = $2', [id, user.id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus dunia.');
  }
}
