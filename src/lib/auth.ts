import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { execute, query, queryOne } from './db';
import { getClientIp, HttpError } from './http';

export const SESSION_COOKIE = 'naravia_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const CLEANUP_THROTTLE_MS = 30 * 60 * 1000;

let lastSessionCleanupAt = 0;

export interface SessionInfo {
  id: string;
  user_agent: string;
  ip: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  display_name: string;
  role: 'user' | 'admin';
  daily_token_budget: number | null;
  sessionId: string;
}

// Token mentah hanya disimpan di cookie; database menyimpan hash-nya
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isSecureCookieEnabled(): boolean {
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.COOKIE_SECURE === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

export async function cleanupExpiredSessions(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastSessionCleanupAt < CLEANUP_THROTTLE_MS) return 0;
  lastSessionCleanupAt = now;
  return execute('DELETE FROM sessions WHERE expires_at <= now()').catch(() => 0);
}

export async function createSession(userId: string, req: NextRequest) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await execute(
    `INSERT INTO sessions (id, user_id, user_agent, ip, expires_at) VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(token), userId, (req.headers.get('user-agent') || '').slice(0, 300), getClientIp(req), expiresAt.toISOString()]
  );
  // Bersihkan sesi kedaluwarsa secara berkala tanpa menghambat respons login
  cleanupExpiredSessions().catch(() => undefined);
  return { token, expiresAt };
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookieEnabled(),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isSecureCookieEnabled(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  return getSessionUserByToken(req.cookies.get(SESSION_COOKIE)?.value);
}

// Dipakai juga oleh server component (layout admin) lewat cookies() dari next/headers
export async function getSessionUserByToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;

  const sessionId = hashToken(token);
  const row = await queryOne<{
    id: string;
    email: string;
    display_name: string;
    role: 'user' | 'admin';
    daily_token_budget: number | null;
    last_seen_at: string;
  }>(
    `SELECT u.id, u.email, u.display_name, u.role, u.daily_token_budget, s.last_seen_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now() AND u.is_active = 1`,
    [sessionId]
  );
  if (!row) return null;

  if (Date.now() - new Date(row.last_seen_at).getTime() > LAST_SEEN_THROTTLE_MS) {
    await execute('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [sessionId]).catch(() => undefined);
  }

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    daily_token_budget: row.daily_token_budget,
    sessionId,
  };
}

export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw new HttpError(401, 'Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.');
  return user;
}

export async function requireAdmin(req: NextRequest): Promise<SessionUser> {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw new HttpError(403, 'Halaman ini hanya dapat diakses oleh admin.');
  return user;
}

export async function destroySession(sessionId: string) {
  await execute('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

export async function listUserSessions(userId: string, currentSessionId: string): Promise<SessionInfo[]> {
  const rows = await query<{
    id: string;
    user_agent: string;
    ip: string;
    created_at: string;
    last_seen_at: string;
    expires_at: string;
  }>(
    `SELECT id, user_agent, ip, created_at, last_seen_at, expires_at
     FROM sessions
     WHERE user_id = $1 AND expires_at > now()
     ORDER BY last_seen_at DESC, created_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    ...r,
    is_current: r.id === currentSessionId,
  }));
}

export async function revokeSessionById(userId: string, sessionId: string): Promise<number> {
  return execute('DELETE FROM sessions WHERE user_id = $1 AND id = $2', [userId, sessionId]);
}

export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  if (exceptSessionId) {
    return execute('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, exceptSessionId]);
  }
  return execute('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export function normalizeEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
