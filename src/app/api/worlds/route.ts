import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { LoreEntryRow, query, queryOne, WorldRow } from '@/lib/db';
import { formatWorldRow } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';

export const runtime = 'nodejs';

const MAX_WORLDS_PER_USER = 100;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const worlds = await query<WorldRow>('SELECT * FROM worlds WHERE user_id = $1 ORDER BY updated_at DESC', [user.id]);
    if (worlds.length === 0) return NextResponse.json({ worlds: [] });

    const ids = worlds.map((w) => w.id);
    const [lore, chars] = await Promise.all([
      query<LoreEntryRow>('SELECT * FROM lore_entries WHERE world_id = ANY($1) ORDER BY created_at ASC', [ids]),
      query<{ id: string; name: string; tagline: string; avatar: string; world_id: string }>(
        'SELECT id, name, tagline, avatar, world_id FROM characters WHERE user_id = $1 AND world_id = ANY($2) ORDER BY name ASC',
        [user.id, ids]
      ),
    ]);

    const result = worlds.map((w) =>
      formatWorldRow(
        w,
        lore.filter((l) => l.world_id === w.id),
        chars.filter((c) => c.world_id === w.id).map(({ world_id: _w, ...c }) => c)
      )
    );
    return NextResponse.json({ worlds: result });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat daftar dunia.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const name = String(body.name || '').trim();
    if (!name) return jsonError('Nama dunia wajib diisi.', 400);
    if (name.length > 120) return jsonError('Nama dunia maksimal 120 karakter.', 400);

    const count = await queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM worlds WHERE user_id = $1', [user.id]);
    if (Number(count?.cnt || 0) >= MAX_WORLDS_PER_USER) {
      return jsonError(`Batas maksimal ${MAX_WORLDS_PER_USER} dunia per akun sudah tercapai.`, 400);
    }

    const created = await queryOne<WorldRow>(
      `INSERT INTO worlds (id, user_id, name, description, rules, places, factions, timeline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        newId('world'),
        user.id,
        name,
        String(body.description || '').trim(),
        String(body.rules || '').trim(),
        JSON.stringify(Array.isArray(body.places) ? body.places : []),
        JSON.stringify(Array.isArray(body.factions) ? body.factions : []),
        JSON.stringify(Array.isArray(body.timeline) ? body.timeline : []),
      ]
    );
    return NextResponse.json({ world: formatWorldRow(created!) }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal membuat dunia baru.');
  }
}
