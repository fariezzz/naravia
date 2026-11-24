import { NextRequest, NextResponse } from 'next/server';
import { createSession, isValidEmail, normalizeEmail, setSessionCookie } from '@/lib/auth';
import { execute, queryOne, UserRow } from '@/lib/db';
import { getClientIp, handleApiError, jsonError, readJson } from '@/lib/http';
import { verifyPassword } from '@/lib/password';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit';
import { logAudit } from '@/lib/store';

export const runtime = 'nodejs';

// Hash tiruan agar waktu respons sama saat email tidak terdaftar (mencegah enumerasi akun)
const DUMMY_HASH = 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    if (!isValidEmail(email) || !password) {
      return jsonError('Email dan kata sandi wajib diisi dengan benar.', 400);
    }

    // Batasi percobaan per IP, pasangan (IP+email), dan ambang global email yang lebih longgar
    // agar satu IP jahat tidak mudah mengunci (lockout DoS) pemilik akun sah.
    const ipLimit = checkRateLimit(`login-ip:${ip}`, 20, 15 * 60_000);
    const pairLimit = checkRateLimit(`login-pair:${ip}:${email}`, 8, 15 * 60_000);
    const globalEmailLimit = checkRateLimit(`login-email-global:${email}`, 40, 15 * 60_000);
    if (!ipLimit.ok || !pairLimit.ok || !globalEmailLimit.ok) {
      const wait = Math.max(ipLimit.retryAfterSec, pairLimit.retryAfterSec, globalEmailLimit.retryAfterSec);
      return jsonError(`Terlalu banyak percobaan masuk. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, 429);
    }

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    const passwordOk = await verifyPassword(password, user?.password_hash || DUMMY_HASH);

    if (!user || !passwordOk) {
      await logAudit({ actorEmail: email, action: 'login_gagal', ip });
      return jsonError('Email atau kata sandi salah.', 401);
    }
    if (!user.is_active) {
      await logAudit({ userId: user.id, actorEmail: email, action: 'login_ditolak_nonaktif', ip });
      return jsonError('Akun ini dinonaktifkan. Hubungi admin.', 403);
    }

    resetRateLimit(`login-pair:${ip}:${email}`);
    const { token, expiresAt } = await createSession(user.id, req);
    await execute('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    await logAudit({ userId: user.id, actorEmail: email, action: 'login', ip });

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role },
    });
    setSessionCookie(res, token, expiresAt);
    return res;
  } catch (err) {
    return handleApiError(err, 'Gagal masuk.');
  }
}
