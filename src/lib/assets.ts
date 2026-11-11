import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * Memastikan direktori public/uploads ada
 */
function ensureUploadsDir(): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  return UPLOADS_DIR;
}

/**
 * Menghapus satu file aset avatar dari folder public/uploads
 * jika dan HANYA jika file tersebut tidak lagi digunakan oleh
 * karakter lain atau persona lain di database (mencegah penghapusan aset bersama).
 */
export function deleteUploadAsset(avatarUrl: string | null | undefined): boolean {
  if (!avatarUrl || typeof avatarUrl !== 'string') return false;

  const trimmed = avatarUrl.trim();
  // Hanya proses jika menunjuk ke penyimpanan lokal /uploads/
  if (!trimmed.startsWith('/uploads/')) return false;

  const filename = path.basename(trimmed);
  // Lindungi dari directory traversal dan file penting seperti .gitkeep
  if (!filename || filename === '.gitkeep' || filename.startsWith('.')) return false;

  const uploadsDir = ensureUploadsDir();
  const filePath = path.resolve(uploadsDir, filename);

  // Pastikan path tetap berada di dalam folder public/uploads
  if (!filePath.startsWith(uploadsDir)) return false;

  try {
    const db = getDb();

    // 1. Cek apakah masih digunakan oleh karakter lain di database
    const charUsage = db
      .prepare('SELECT COUNT(*) as cnt FROM characters WHERE avatar = ?')
      .get(trimmed) as { cnt: number } | undefined;

    if (charUsage && charUsage.cnt > 0) {
      // Masih digunakan oleh karakter aktif lain
      return false;
    }

    // 2. Cek apakah masih digunakan oleh persona pengguna lain di database
    let personaUsage: { cnt: number } | undefined;
    try {
      personaUsage = db
        .prepare('SELECT COUNT(*) as cnt FROM user_personas WHERE avatar = ?')
        .get(trimmed) as { cnt: number } | undefined;
    } catch {
      // Abaikan jika tabel user_personas belum ada
    }

    if (personaUsage && personaUsage.cnt > 0) {
      // Masih digunakan oleh persona aktif lain
      return false;
    }

    // Jika tidak lagi ada yang merujuk, hapus file fisik dari disk
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.error(`[deleteUploadAsset] Gagal menghapus aset ${filename}:`, err);
  }

  return false;
}

/**
 * Menghapus file avatar lama jika pengguna mengganti foto profil dengan yang baru.
 */
export function replaceUploadAsset(
  oldAvatarUrl: string | null | undefined,
  newAvatarUrl: string | null | undefined
): boolean {
  if (!oldAvatarUrl || !newAvatarUrl) return false;
  if (oldAvatarUrl.trim() === newAvatarUrl.trim()) return false;
  return deleteUploadAsset(oldAvatarUrl);
}

/**
 * Membersihkan seluruh file upload yang tidak memiliki referensi (orphaned assets)
 * di database karakter maupun persona pengguna.
 */
export function cleanupOrphanedUploads(): number {
  const uploadsDir = ensureUploadsDir();
  let deletedCount = 0;

  try {
    const db = getDb();

    // Ambil seluruh avatar yang aktif digunakan
    const charAvatars = (db.prepare('SELECT avatar FROM characters WHERE avatar LIKE "/uploads/%"').all() as Array<{
      avatar: string;
    }>).map((r) => r.avatar.trim());

    let personaAvatars: string[] = [];
    try {
      personaAvatars = (db
        .prepare('SELECT avatar FROM user_personas WHERE avatar LIKE "/uploads/%"')
        .all() as Array<{ avatar: string }>).map((r) => r.avatar.trim());
    } catch {
      // Abaikan jika tabel belum ada
    }

    const activeSet = new Set<string>([...charAvatars, ...personaAvatars]);

    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      if (file === '.gitkeep' || file.startsWith('.')) continue;

      const fileUrl = `/uploads/${file}`;
      if (!activeSet.has(fileUrl)) {
        const fullPath = path.join(uploadsDir, file);
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            deletedCount++;
          }
        } catch (unlinkErr) {
          console.error(`[cleanupOrphanedUploads] Gagal menghapus file yatim ${file}:`, unlinkErr);
        }
      }
    }
  } catch (err) {
    console.error('[cleanupOrphanedUploads] Error saat memindai aset yatim:', err);
  }

  return deletedCount;
}
