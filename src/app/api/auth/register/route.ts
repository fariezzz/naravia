import { NextRequest, NextResponse } from 'next/server';
import { createSession, isValidEmail, normalizeEmail, setSessionCookie } from '@/lib/auth';
import { queryOne, withTransaction } from '@/lib/db';
import { getClientIp, handleApiError, HttpError, jsonError, readJson } from '@/lib/http';
import { validatePasswordStrength } from '@/lib/password';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSystemSettings, logAudit } from '@/lib/store';
import { insertUserRecords } from '@/lib/userRecords';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limit = checkRateLimit(`register-ip:${ip}`, 5, 60 * 60_000);
    if (!limit.ok) {
      return jsonError('Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.', 429);
    }

    const system = await getSystemSettings();
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const displayName = String(body.display_name || '').trim();

    if (!isValidEmail(email)) return jsonError('Format email tidak valid.', 400);
    if (!displayName || displayName.length > 60) {
      return jsonError('Nama tampilan wajib diisi (maksimal 60 karakter).', 400);
    }
    const passwordIssue = validatePasswordStrength(password);
    if (passwordIssue) return jsonError(passwordIssue, 400);

    // Kunci transaksi advisory mencegah race condition promosi admin ganda saat instalasi baru
    const { userId, role, isFirstUser } = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(7240312)');

      const userCount = await queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM users', [], client);
      const firstUser = Number(userCount?.cnt || 0) === 0;

      // Pendaftaran pertama selalu dibuka agar admin awal bisa dibuat tanpa akses server
      if (!firstUser && system.registration_mode === 'closed') {
        throw new HttpError(403, 'Pendaftaran akun baru sedang ditutup oleh admin.');
      }

      const exists = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email], client);
      if (exists) {
        throw new HttpError(409, 'Email ini sudah terdaftar. Silakan masuk.');
      }

      const assignedRole = firstUser ? 'admin' : 'user';
      const newUserId = await insertUserRecords(client, {
        email,
        password,
        displayName,
        role: assignedRole,
      });
      return { userId: newUserId, role: assignedRole, isFirstUser: firstUser };
    });

    await logAudit({ userId, actorEmail: email, action: isFirstUser ? 'daftar_admin_pertama' : 'daftar', ip });

    const { token, expiresAt } = await createSession(userId, req);
    const res = NextResponse.json(
      { user: { id: userId, email, display_name: displayName, role } },
      { status: 201 }
    );
    setSessionCookie(res, token, expiresAt);
    return res;
  } catch (err) {
    return handleApiError(err, 'Gagal membuat akun.');
  }
}
