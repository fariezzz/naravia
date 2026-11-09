import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const key = String(body.key || '').trim();
  const requiredKey = (process.env.NARAVIA_ACCESS_KEY || '').trim();

  if (!requiredKey || key === requiredKey) {
    const res = NextResponse.json({ success: true });
    res.cookies.set('naravia_access_token', key, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  return NextResponse.json({ error: 'Kunci akses tidak sesuai.' }, { status: 401 });
}
