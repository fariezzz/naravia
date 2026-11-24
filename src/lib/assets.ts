import fs from 'node:fs';
import path from 'node:path';
import { execute, query, queryOne } from './db';
import { HttpError } from './http';

// Simpan unggahan di luar folder `public/` agar Next.js tidak pernah melayani
// file privat secara statis tanpa melewati otorisasi di route `/uploads/[...path]`.
const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');
const LEGACY_UPLOADS_DIR = path.resolve(process.cwd(), 'public', 'uploads');

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_USER_UPLOAD_STORAGE_BYTES = 100 * 1024 * 1024; // 100 MB per akun

let legacyMigrated = false;

function moveFileSafe(src: string, dest: string) {
  try {
    fs.renameSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

/**
 * Memindahkan unggahan lama dari `public/uploads` ke `data/uploads` sekali per proses
 * agar deployment lama otomatis beralih tanpa kehilangan avatar.
 */
export function migrateLegacyUploadsOnce(): void {
  if (legacyMigrated) return;
  legacyMigrated = true;

  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(LEGACY_UPLOADS_DIR)) return;

    const entries = fs.readdirSync(LEGACY_UPLOADS_DIR);
    for (const name of entries) {
      if (!name || name.startsWith('.')) continue;
      const src = path.resolve(LEGACY_UPLOADS_DIR, name);
      if (!src.startsWith(LEGACY_UPLOADS_DIR + path.sep)) continue;
      const stat = fs.statSync(src);
      if (!stat.isFile()) continue;

      const dest = path.resolve(UPLOADS_DIR, name);
      if (!dest.startsWith(UPLOADS_DIR + path.sep)) continue;
      if (!fs.existsSync(dest)) {
        try {
          moveFileSafe(src, dest);
        } catch (err) {
          console.warn(`[assets] Gagal memindahkan file unggahan lama ${name}:`, err);
        }
      }
    }
  } catch (err) {
    console.warn('[assets] Gagal memeriksa direktori unggahan lama:', err);
  }
}

export function ensureUploadsDir(): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  migrateLegacyUploadsOnce();
  return UPLOADS_DIR;
}

// Memvalidasi nama file datar tanpa traversal direktori
export function isSafeUploadFilename(filename: string | null | undefined): filename is string {
  if (!filename || typeof filename !== 'string') return false;
  const base = path.basename(filename);
  if (!base || base.startsWith('.') || base !== filename) return false;
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return false;
  return true;
}

/**
 * Mencari lokasi fisik berkas unggahan (utama di `data/uploads`, fallback baca di `public/uploads`).
 */
export function resolveUploadFilePath(filename: string): string | null {
  if (!isSafeUploadFilename(filename)) return null;
  ensureUploadsDir();

  const primary = path.resolve(UPLOADS_DIR, filename);
  if (primary.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(primary)) {
    return primary;
  }

  const legacy = path.resolve(LEGACY_UPLOADS_DIR, filename);
  if (legacy.startsWith(LEGACY_UPLOADS_DIR + path.sep) && fs.existsSync(legacy)) {
    return legacy;
  }

  return null;
}

// Mengubah URL /uploads/xxx menjadi nama file aman (tanpa traversal), atau null jika bukan unggahan lokal
export function uploadFilenameFromUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  const trimmed = avatarUrl.trim();
  if (!trimmed.startsWith('/uploads/')) return null;
  const rest = trimmed.slice('/uploads/'.length);
  return isSafeUploadFilename(rest) ? rest : null;
}

async function isUploadReferenced(url: string): Promise<boolean> {
  const avatarFieldNeedle = `"avatar":${JSON.stringify(url)}`;
  const row = await queryOne<{ cnt: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM characters WHERE avatar = $1) +
       (SELECT COUNT(*) FROM user_personas WHERE avatar = $1) +
       (SELECT COUNT(*) FROM stories WHERE cover_image = $1) +
       (SELECT COUNT(*) FROM chats WHERE character_snapshot IS NOT NULL AND POSITION($2 IN character_snapshot) > 0) +
       (SELECT COUNT(*) FROM story_cast WHERE character_snapshot IS NOT NULL AND POSITION($2 IN character_snapshot) > 0)
     ) AS cnt`,
    [url, avatarFieldNeedle]
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

  try {
    const owner = await queryOne<{ user_id: string | null }>('SELECT user_id FROM uploads WHERE filename = $1', [filename]);
    if (!owner || owner.user_id !== userId) return false;
    if (await isUploadReferenced(`/uploads/${filename}`)) return false;

    const fullPath = resolveUploadFilePath(filename);
    if (fullPath && fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
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

// Pastikan total penyimpanan berkas milik pengguna tidak melampaui kuota akun
export async function assertUserUploadQuota(userId: string, incomingBytes: number): Promise<void> {
  const row = await queryOne<{ total: number }>(
    'SELECT COALESCE(SUM(size_bytes), 0) AS total FROM uploads WHERE user_id = $1',
    [userId]
  );
  const currentTotal = Number(row?.total || 0);
  if (currentTotal + Math.max(0, incomingBytes) > MAX_USER_UPLOAD_STORAGE_BYTES) {
    throw new HttpError(
      400,
      'Kuota penyimpanan unggahan akun (100 MB) sudah penuh. Bersihkan aset lama di Pengaturan terlebih dahulu.'
    );
  }
}

// Pastikan avatar yang dipasang ke entitas adalah milik pengguna sendiri (atau URL https eksternal/kosong)
export async function assertAvatarOwnership(
  avatarUrl: unknown,
  userId: string,
  options?: { allowExternal?: boolean }
): Promise<string> {
  const trimmed = String(avatarUrl || '').trim();
  if (!trimmed) return '';
  const allowExternal = options?.allowExternal ?? true;
  const filename = uploadFilenameFromUrl(trimmed);
  if (!filename) {
    if (allowExternal && /^https:\/\//i.test(trimmed) && trimmed.length <= 1000) return trimmed;
    return '';
  }
  const owner = await queryOne<{ user_id: string | null }>('SELECT user_id FROM uploads WHERE filename = $1', [filename]);
  if (!owner || owner.user_id !== userId) return '';
  return `/uploads/${filename}`;
}

/**
 * Mensterilkan JSON character_snapshot saat restore/import agar tidak ada path
 * `/uploads/<milik_orang_lain>` yang bisa disuntikkan ke snapshot untuk mem-bypass
 * otorisasi `/uploads/[...path]` atau mengunci penghapusan file pemilik sah.
 */
export async function sanitizeSnapshotAvatar(
  rawSnapshot: unknown,
  userId: string
): Promise<string | null> {
  if (!rawSnapshot) return null;
  let parsed: Record<string, unknown>;
  try {
    const candidate = typeof rawSnapshot === 'string' ? JSON.parse(rawSnapshot) : rawSnapshot;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    parsed = { ...(candidate as Record<string, unknown>) };
  } catch {
    return null;
  }

  if (typeof parsed.avatar === 'string') {
    parsed.avatar = await assertAvatarOwnership(parsed.avatar, userId);
  }

  // Pastikan tidak ada properti string lain yang menyelipkan path /uploads/<milik_orang_lain>
  const ownedFiles = new Set(
    (await query<{ filename: string }>('SELECT filename FROM uploads WHERE user_id = $1', [userId])).map(
      (r) => r.filename
    )
  );
  const stripForeignUploads = (val: unknown): unknown => {
    if (typeof val === 'string') {
      return val.replace(/\/uploads\/([A-Za-z0-9._-]+)/g, (match, fname: string) =>
        ownedFiles.has(fname) ? match : ''
      );
    }
    if (Array.isArray(val)) return val.map(stripForeignUploads);
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[k] = stripForeignUploads(v);
      }
      return out;
    }
    return val;
  };

  return JSON.stringify(stripForeignUploads(parsed));
}

/**
 * Membersihkan file unggahan yatim. Jika userId diberikan, hanya file milik pengguna itu yang diperiksa.
 * Tanpa userId (khusus admin), seluruh catatan uploads yang sudah tidak direferensikan dipindai.
 */
export async function cleanupOrphanedUploads(userId?: string): Promise<number> {
  ensureUploadsDir();
  let deletedCount = 0;

  try {
    const active = await query<{ avatar: string }>(
      `SELECT avatar FROM characters WHERE avatar LIKE '/uploads/%'
       UNION SELECT avatar FROM user_personas WHERE avatar LIKE '/uploads/%'
       UNION SELECT cover_image AS avatar FROM stories WHERE cover_image LIKE '/uploads/%'`
    );
    const activeSet = new Set(active.map((r) => r.avatar.trim()));

    const recorded = userId
      ? await query<{ filename: string; created_at: string }>(
          'SELECT filename, created_at FROM uploads WHERE user_id = $1',
          [userId]
        )
      : await query<{ filename: string; created_at: string }>('SELECT filename, created_at FROM uploads');

    const GRACE_MS = 60 * 60 * 1000;
    const candidates = recorded
      .filter((r) => Date.now() - new Date(r.created_at).getTime() > GRACE_MS)
      .map((r) => r.filename);

    for (const file of candidates) {
      const url = `/uploads/${file}`;
      if (activeSet.has(url)) continue;
      // Pastikan juga tidak sedang dipakai di arsip snapshot percakapan atau pemeran cerita
      const snapRef = await queryOne<{ cnt: number }>(
        `SELECT (
           (SELECT COUNT(*) FROM chats WHERE character_snapshot IS NOT NULL AND POSITION($1 IN character_snapshot) > 0) +
           (SELECT COUNT(*) FROM story_cast WHERE character_snapshot IS NOT NULL AND POSITION($1 IN character_snapshot) > 0)
         ) AS cnt`,
        [`"avatar":${JSON.stringify(url)}`]
      );
      if (Number(snapRef?.cnt || 0) > 0) continue;

      const fullPath = resolveUploadFilePath(file);
      try {
        if (fullPath && fs.existsSync(fullPath)) {
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
