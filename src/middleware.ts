import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware berjalan di Edge runtime (tanpa akses database), jadi hanya memeriksa
 * keberadaan cookie sesi untuk mengalihkan halaman. Validasi sesi yang sesungguhnya
 * (token, masa berlaku, status akun, peran admin) dilakukan di setiap API route.
 */
const SESSION_COOKIE = 'naravia_session';
const PUBLIC_PAGES = ['/login', '/register'];
const PUBLIC_API = ['/api/auth/login', '/api/auth/register', '/api/auth/config', '/api/auth/logout', '/api/health'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith('/api/')) {
    if (PUBLIC_API.includes(pathname)) return NextResponse.next();
    if (!hasSession) {
      return NextResponse.json({ error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }
    return NextResponse.next();
  }

  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublicPage) return NextResponse.next();

  if (!hasSession) {
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.json|robots.txt).*)'],
};
