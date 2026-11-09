import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware Fase 4 (Opsional):
 * Di lokal (tanpa NARAVIA_ACCESS_KEY), aplikasi terbuka langsung tanpa login.
 * Jika nanti di-deploy ke VM dan variabel environment NARAVIA_ACCESS_KEY diisi,
 * pengguna cukup memasukkan kunci akses sekali untuk menyimpan sesi cookie.
 */
export function middleware(req: NextRequest) {
  const requiredKey = (process.env.NARAVIA_ACCESS_KEY || '').trim();
  if (!requiredKey) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/unlock') ||
    pathname.startsWith('/api/unlock') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icon.svg') ||
    pathname.startsWith('/manifest.json')
  ) {
    return NextResponse.next();
  }

  const cookieKey = req.cookies.get('naravia_access_token')?.value;
  if (cookieKey === requiredKey) {
    return NextResponse.next();
  }

  const unlockUrl = req.nextUrl.clone();
  unlockUrl.pathname = '/unlock';
  return NextResponse.redirect(unlockUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
