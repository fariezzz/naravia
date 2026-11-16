import fs from 'node:fs';
import path from 'node:path';
import { execute, query, queryOne } from './db';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function ensureUploadsDir(): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  return UPLOADS_DIR;
}

// Mengubah URL /uploads/xxx menjadi nama file aman (tanpa traversal), atau null jika bukan unggahan lokal
export function uploadFilenameFromUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  const trimmed = avatarUrl.trim();
  if (!trimmed.startsWith('/uploads/')) return null;
  const filename = path.basename(trimmed);
  if (!filename || filename.startsWith('.') || filename !== trimmed.slice('/uploads/'.length)) return null;
  return filename;
}

async function isUploadReferenced(url: string): Promise<boolean> {
  const row = await queryOne<{ cnt: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM characters WHERE avatar = $1) +
       (SELECT COUNT(*) FROM user_personas WHERE avatar = $1)
     ) AS cnt`,
    [url]
  );
  return Number(row?.cnt || 0) > 0;
}

/**
 * Menghapus file unggahan milik pengguna jika sudah tidak dipakai entitas mana pun.
 * File milik pengguna lain tidak pernah dihapus.
 */
export async function deleteUploadAsset(avatarUrl: string | null | undefined, userId: string): Promise<boolean> {
  const filename = uploadFilenameFromUrl(avatarUrl);
  if (!filename) return false;

  const uploadsDir = ensureUploadsDir();
  const filePath = path.resolve(uploadsDir, filename);
  if (!filePath.startsWith(uploadsDir + path.sep)) return false;

  try {
    const owner = await queryOne<{ user_id: string | null }>('SELECT user_id FROM uploads WHERE filename = $1', [filename]);
    if (!owner || owner.user_id !== userId) return false;
    if (await isUploadReferenced(`/uploads/${filename}`)) return false;

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await execute('DELETE FROM uploads WHERE filename = $1', [filename]);
    return true;
  } catch (err) {
    console.error(`[deleteUploadAsset] Gagal menghapus aset ${filename}:`, err);
    return false;
  }
}

export async function replaceUploadAsset(
  oldAvatarUrl: string | null | undefined,
  newAvatarUrl: string | null | undefined,
  userId: string
): Promise<boolean> {
  if (!oldAvatarUrl || !newAvatarUrl) return false;
  if (oldAvatarUrl.trim() === newAvatarUrl.trim()) return false;
  return deleteUploadAsset(oldAvatarUrl, userId);
}

// Pastikan avatar yang dipasang ke entitas adalah milik pengguna sendiri (atau URL https eksternal/kosong)
export async function assertAvatarOwnership(avatarUrl: unknown, userId: string): Promise<string> {
  const trimmed = String(avatarUrl || '').trim();
  if (!trimmed) return '';
  const filename = uploadFilenameFromUrl(trimmed);
  if (!filename) {
    if (/^https:\/\//i.test(trimmed) && trimmed.length <= 1000) return trimmed;
    return '';
  }
  const owner = await queryOne<{ user_id: string | null }>('SELECT user_id FROM uploads WHERE filename = $1', [filename]);
  if (!owner || owner.user_id !== userId) return '';
  return `/uploads/${filename}`;
}

/**
 * Membersihkan file unggahan yatim. Jika userId diberikan, hanya file milik pengguna itu yang diperiksa.
 * Tanpa userId (khusus admin), seluruh folder unggahan dipindai termasuk file tanpa catatan kepemilikan.
 */
export async function cleanupOrphanedUploads(userId?: string): Promise<number> {
  const uploadsDir = ensureUploadsDir();
  let deletedCount = 0;

  try {
    const active = await query<{ avatar: string }>(
      `SELECT avatar FROM characters WHERE avatar LIKE '/uploads/%'
       UNION SELECT avatar FROM user_personas WHERE avatar LIKE '/uploads/%'`
    );
    const activeSet = new Set(active.map((r) => r.avatar.trim()));

    let candidates: string[];
    if (userId) {
      const owned = await query<{ filename: string }>('SELECT filename FROM uploads WHERE user_id = $1', [userId]);
      candidates = owned.map((r) => r.filename);
    } else {
      candidates = fs.readdirSync(uploadsDir).filter((f) => !f.startsWith('.'));
    }

    for (const file of candidates) {
      if (activeSet.has(`/uploads/${file}`)) continue;
      const fullPath = path.join(uploadsDir, file);
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
        await execute('DELETE FROM uploads WHERE filename = $1', [file]);
      } catch (unlinkErr) {
        console.error(`[cleanupOrphanedUploads] Gagal menghapus file yatim ${file}:`, unlinkErr);
      }
    }
  } catch (err) {
    console.error('[cleanupOrphanedUploads] Error saat memindai aset yatim:', err);
  }

  return deletedCount;
}
