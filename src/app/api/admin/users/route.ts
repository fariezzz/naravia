import { NextRequest, NextResponse } from 'next/server';
import { cleanupOrphanedUploads } from '@/lib/assets';
import { isValidEmail, normalizeEmail, requireAdmin, revokeUserSessions } from '@/lib/auth';
import { APP_TIMEZONE, execute, query, queryOne, UserRow, withTransaction } from '@/lib/db';
import { getClientIp, handleApiError, HttpError, jsonError, readJson } from '@/lib/http';
import { hashPassword, validatePasswordStrength } from '@/lib/password';
import { logAudit } from '@/lib/store';
import { insertUserRecords } from '@/lib/userRecords';

export const runtime = 'nodejs';

// Daftar akun beserta ringkasan pemakaian. Isi chat/karakter pengguna lain TIDAK diekspos ke admin.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const users = await query(
      `SELECT
         u.id, u.email, u.display_name, u.role, u.is_active, u.daily_token_budget,
         u.last_login_at, u.created_at,
         (SELECT COUNT(*) FROM characters c WHERE c.user_id = u.id) AS character_count,
         (SELECT COUNT(*) FROM chats ch WHERE ch.user_id = u.id) AS chat_count,
         (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS active_sessions,
         (SELECT COALESCE(SUM(t.tokens_in + t.tokens_out), 0) FROM token_usage t WHERE t.user_id = u.id) AS total_tokens,
         (SELECT COALESCE(SUM(t.tokens_in + t.tokens_out), 0) FROM token_usage t
            WHERE t.user_id = u.id AND t.created_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)
         ) AS today_tokens
       FROM users u
       ORDER BY u.created_at ASC`,
      [APP_TIMEZONE]
    );
    return NextResponse.json({ users: users.map((u) => ({ ...u, is_active: Boolean(u.is_active) })) });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat daftar pengguna.');
  }
}

async function requireTargetUser(id: string) {
  const row = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  if (!row) throw new HttpError(404, 'Pengguna tidak ditemukan.');
  return row;
}

async function countActiveAdmins(excludeId?: string): Promise<number> {
  const row = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND is_active = 1 AND id <> $1`,
    [excludeId || '']
  );
  return Number(row?.cnt || 0);
}

function parseBudget(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Kuota token harus berupa angka 0 atau lebih.');
  return n;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const body = await readJson(req);
    const ip = getClientIp(req);
    const action = String(body.action || '');

    // Buat akun baru oleh admin (tetap berfungsi walau pendaftaran publik ditutup)
    if (action === 'create') {
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const displayName = String(body.display_name || '').trim().slice(0, 60);
      const role = body.role === 'admin' ? 'admin' : 'user';
      if (!isValidEmail(email)) return jsonError('Format email tidak valid.', 400);
      if (!displayName) return jsonError('Nama tampilan wajib diisi.', 400);
      const issue = validatePasswordStrength(password);
      if (issue) return jsonError(issue, 400);
      if (await queryOne('SELECT id FROM users WHERE email = $1', [email])) {
        return jsonError('Email ini sudah terdaftar.', 409);
      }

      const userId = await withTransaction((client) =>
        insertUserRecords(client, {
          email,
          password,
          displayName,
          role,
          dailyTokenBudget: parseBudget(body.daily_token_budget),
        })
      );
      await logAudit({ userId: admin.id, actorEmail: admin.email, action: 'admin_buat_akun', detail: `${email} (${role})`, ip });
      return NextResponse.json({ success: true, id: userId }, { status: 201 });
    }

    const target = await requireTargetUser(String(body.userId || ''));
    const isSelf = target.id === admin.id;

    if (action === 'update') {
      const role = body.role !== undefined ? (body.role === 'admin' ? 'admin' : 'user') : target.role;
      const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : target.is_active;
      const budget = body.daily_token_budget !== undefined ? parseBudget(body.daily_token_budget) : target.daily_token_budget;
      const displayName =
        body.display_name !== undefined ? String(body.display_name).trim().slice(0, 60) || target.display_name : target.display_name;

      // Cegah sistem kehilangan admin aktif terakhir
      const losingAdmin = target.role === 'admin' && target.is_active && (role !== 'admin' || !isActive);
      if (losingAdmin && (await countActiveAdmins(target.id)) === 0) {
        return jsonError('Tidak bisa menurunkan atau menonaktifkan admin aktif terakhir.', 400);
      }
      if (isSelf && !isActive) return jsonError('Kamu tidak bisa menonaktifkan akunmu sendiri.', 400);

      await execute(
        `UPDATE users SET role = $1, is_active = $2, daily_token_budget = $3, display_name = $4, updated_at = now()
         WHERE id = $5`,
        [role, isActive, budget, displayName, target.id]
      );
      if (!isActive) await revokeUserSessions(target.id);

      const changes = [
        role !== target.role ? `peran=${role}` : '',
        isActive !== target.is_active ? `aktif=${isActive ? 'ya' : 'tidak'}` : '',
        budget !== target.daily_token_budget ? `kuota=${budget ?? 'bawaan'}` : '',
      ].filter(Boolean);
      await logAudit({
        userId: admin.id,
        actorEmail: admin.email,
        action: 'admin_ubah_akun',
        detail: `${target.email}: ${changes.join(', ') || 'nama'}`,
        ip,
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'reset_password') {
      const password = String(body.password || '');
      const issue = validatePasswordStrength(password);
      if (issue) return jsonError(issue, 400);
      await execute('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
        await hashPassword(password),
        target.id,
      ]);
      // Sesi lama pengguna dicabut agar kata sandi baru langsung berlaku
      if (!isSelf) await revokeUserSessions(target.id);
      await logAudit({ userId: admin.id, actorEmail: admin.email, action: 'admin_reset_sandi', detail: target.email, ip });
      return NextResponse.json({ success: true });
    }

    if (action === 'revoke_sessions') {
      const revoked = await revokeUserSessions(target.id, isSelf ? admin.sessionId : undefined);
      await logAudit({
        userId: admin.id,
        actorEmail: admin.email,
        action: 'admin_cabut_sesi',
        detail: `${target.email}: ${revoked} sesi`,
        ip,
      });
      return NextResponse.json({ success: true, revoked });
    }

    if (action === 'delete') {
      if (isSelf) return jsonError('Kamu tidak bisa menghapus akunmu sendiri.', 400);
      if (target.role === 'admin' && target.is_active && (await countActiveAdmins(target.id)) === 0) {
        return jsonError('Tidak bisa menghapus admin aktif terakhir.', 400);
      }
      if (String(body.confirmEmail || '').trim().toLowerCase() !== target.email) {
        return jsonError('Ketik ulang email pengguna untuk mengonfirmasi penghapusan.', 400);
      }

      // Semua data pengguna ikut terhapus lewat ON DELETE CASCADE
      await execute('DELETE FROM users WHERE id = $1', [target.id]);
      const deletedFiles = await cleanupOrphanedUploads();
      await logAudit({
        userId: admin.id,
        actorEmail: admin.email,
        action: 'admin_hapus_akun',
        detail: `${target.email} (${deletedFiles} file dibersihkan)`,
        ip,
      });
      return NextResponse.json({ success: true });
    }

    return jsonError('Aksi tidak dikenali.', 400);
  } catch (err) {
    return handleApiError(err, 'Gagal mengelola pengguna.');
  }
}
