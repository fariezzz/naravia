import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { execute, LoreEntryRow, queryOne } from '@/lib/db';
import { formatLoreRow } from '@/lib/format';
import { handleApiError, jsonError, readJson } from '@/lib/http';
import { newId } from '@/lib/ids';
import { requireOwnedLore, requireOwnedWorld } from '@/lib/store';

export const runtime = 'nodejs';

function parseKeywords(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map((k) => String(k || '')) : String(raw || '').split(',');
  return list.map((k) => k.trim()).filter(Boolean).slice(0, 30);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const worldId = String(body.world_id || '').trim();
    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();
    const keywords = parseKeywords(body.keywords);

    if (!worldId || !content || keywords.length === 0) {
      return jsonError('Dunia, kata kunci pemicu, dan isi penjelasan lore wajib diisi.', 400);
    }
    await requireOwnedWorld(user.id, worldId);

    const created = await queryOne<LoreEntryRow>(
      `INSERT INTO lore_entries (id, world_id, title, keywords, content, enabled)
       VALUES ($1, $2, $3, $4, $5, 1) RETURNING *`,
      [newId('lore'), worldId, (title || keywords[0]).slice(0, 200), JSON.stringify(keywords), content]
    );
    return NextResponse.json({ entry: formatLoreRow(created!) }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Gagal menambah entri lorebook.');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const id = String(body.id || '').trim();
    if (!id) return jsonError('ID entri lore wajib diisi.', 400);

    const existing = await requireOwnedLore(user.id, id);
    const updated = await queryOne<LoreEntryRow>(
      `UPDATE lore_entries SET title = $1, keywords = $2, content = $3, enabled = $4 WHERE id = $5 RETURNING *`,
      [
        body.title !== undefined ? String(body.title).trim().slice(0, 200) : existing.title,
        body.keywords !== undefined ? JSON.stringify(parseKeywords(body.keywords)) : existing.keywords,
        body.content !== undefined ? String(body.content).trim() : existing.content,
        body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
        id,
      ]
    );
    return NextResponse.json({ entry: formatLoreRow(updated!) });
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui entri lorebook.');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return jsonError('ID entri lore wajib disertakan.', 400);
    await requireOwnedLore(user.id, id);
    await execute('DELETE FROM lore_entries WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, 'Gagal menghapus entri lorebook.');
  }
}
