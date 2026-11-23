import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookie,
  listUserSessions,
  requireUser,
  revokeSessionById,
  revokeUserSessions,
} from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { getClientIp, handleApiError, jsonError, readJson } from '@/lib/http';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/password';
import { enforceRateLimit } from '@/lib/rateLimit';
import { logAudit } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const [sessions, row] = await Promise.all([
      listUserSessions(user.id, user.sessionId),
      queryOne<{ created_at: string; last_login_at: string | null }>(
        'SELECT created_at, last_login_at FROM users WHERE id = $1',
        [user.id]
      ),
    ]);
    return NextResponse.json({
      account: {
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        created_at: row?.created_at || null,
        last_login_at: row?.last_login_at || null,
        active_sessions: sessions.length,
        sessions,
      },
    });
  } catch (err) {
    return handleApiError(err, 'Gagal memuat informasi akun.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await readJson(req);
    const ip = getClientIp(req);

    if (body.action === 'update_profile') {
      const displayName = String(body.display_name || '').trim();
      if (!displayName || displayName.length > 60) {
        return jsonError('Nama tampilan wajib diisi (maksimal 60 karakter).', 400);
      }
      await execute('UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2', [displayName, user.id]);
      return NextResponse.json({ success: true, display_name: displayName });
    }

    if (body.action === 'change_password') {
      enforceRateLimit(`change-password:${user.id}`, 5, 15 * 60_000);
      const current = String(body.current_password || '');
      const next = String(body.new_password || '');

      const row = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id]);
      if (!row || !(await verifyPassword(current, row.password_hash))) {
        return jsonError('Kata sandi saat ini salah.', 400);
      }
      const issue = validatePasswordStrength(next);
      if (issue) return jsonError(issue, 400);
      if (current === next) return jsonError('Kata sandi baru harus berbeda dari yang lama.', 400);

      await execute('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
        await hashPassword(next),
        user.id,
      ]);
      // Sesi lain dicabut agar perangkat yang mungkin disusupi ikut keluar
      await revokeUserSessions(user.id, user.sessionId);
      await logAudit({ userId: user.id, actorEmail: user.email, action: 'ganti_kata_sandi', ip });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'revoke_session') {
      const targetSessionId = String(body.session_id || '').trim();
      if (!targetSessionId) return jsonError('ID sesi tidak valid.', 400);
      const removed = await revokeSessionById(user.id, targetSessionId);
      if (removed === 0) return jsonError('Sesi tidak ditemukan.', 404);
      const revokedSelf = targetSessionId === user.sessionId;
      await logAudit({ userId: user.id, actorEmail: user.email, action: 'cabut_sesi_perangkat', ip });
      const res = NextResponse.json({ success: true, revokedSelf });
      if (revokedSelf) clearSessionCookie(res);
      return res;
    }

    if (body.action === 'logout_others') {
      const revoked = await revokeUserSessions(user.id, user.sessionId);
      await logAudit({ userId: user.id, actorEmail: user.email, action: 'keluar_perangkat_lain', detail: `${revoked} sesi`, ip });
      return NextResponse.json({ success: true, revoked });
    }

    if (body.action === 'logout_all') {
      await revokeUserSessions(user.id);
      await logAudit({ userId: user.id, actorEmail: user.email, action: 'keluar_semua_perangkat', ip });
      const res = NextResponse.json({ success: true });
      clearSessionCookie(res);
      return res;
    }

    return jsonError('Aksi tidak dikenali.', 400);
  } catch (err) {
    return handleApiError(err, 'Gagal memperbarui akun.');
  }
}
