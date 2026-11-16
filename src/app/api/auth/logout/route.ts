import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, destroySession, getSessionUser } from '@/lib/auth';
import { getClientIp, handleApiError } from '@/lib/http';
import { logAudit } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (user) {
      await destroySession(user.sessionId);
      await logAudit({ userId: user.id, actorEmail: user.email, action: 'logout', ip: getClientIp(req) });
    }
    const res = NextResponse.json({ success: true });
    clearSessionCookie(res);
    return res;
  } catch (err) {
    return handleApiError(err, 'Gagal keluar.');
  }
}
