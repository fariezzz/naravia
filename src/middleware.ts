import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware berjalan di Edge runtime (tanpa akses database), jadi hanya memeriksa
 * keberadaan cookie sesi untuk mengalihkan halaman. Validasi sesi yang sesungguhnya
 * (token, masa berlaku, status akun, peran admin) dilakukan di setiap API route.
 */
const SESSION_COOKIE = 'naravia_session';
// Beranda terbuka untuk tamu (halaman perkenalan); kontennya berganti menjadi dashboard setelah masuk
const PUBLIC_PAGES = ['/', '/login', '/register'];
// Aset statis halaman perkenalan dan autentikasi; wajib bisa diakses tamu.
//
// /uploads/ ikut diloloskan karena avatar karakter publik harus bisa dimuat tamu.
// Otorisasi per file TIDAK dilepas, hanya dipindah ke src/app/uploads/[...path]/route.ts
// yang memeriksa visibilitas karakter dan kepemilikan file (middleware tidak punya akses database).
const PUBLIC_ASSET_PREFIXES = ['/landing/', '/uploads/'];

/**
 * Halaman dan endpoint karakter/cerita publik boleh dibuka tamu. Middleware tidak bisa
 * membedakan metode HTTP secara andal untuk otorisasi, jadi setiap handler yang
 * mengubah data (POST/PUT/DELETE) tetap memanggil requireUser sendiri.
 * Yang diloloskan di sini hanya pembacaan satu karakter/cerita publik dan katalog publik.
 */
function isPublicBrowsePath(pathname: string): boolean {
  if (pathname === '/jelajah') return true;
  if (pathname === '/api/characters/public') return true;
  if (pathname === '/api/stories/public') return true;

  // /characters/<id> dan /api/characters/<id>
  const CHAR_NON_ID = ['new', 'public', 'visited'];
  const charDetail = pathname.match(/^(?:\/api)?\/characters\/([^/]+)$/);
  if (charDetail && !CHAR_NON_ID.includes(charDetail[1])) return true;

  // /stories/<id>, /api/stories/<id>, dan /api/stories/<id>/export (handler mengecek visibility='public')
  const STORY_NON_ID = ['new', 'public', 'brainstorm'];
  const storyDetail = pathname.match(/^(?:\/api)?\/stories\/([^/]+)(?:\/export)?$/);
  if (storyDetail && !STORY_NON_ID.includes(storyDetail[1])) return true;

  return false;
}
const PUBLIC_API = ['/api/auth/login', '/api/auth/register', '/api/auth/config', '/api/auth/logout', '/api/health'];
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isSameOriginMutation(req: NextRequest, hasSession: boolean): boolean {
  if (!MUTATION_METHODS.has(req.method.toUpperCase())) return true;

  const secFetchSite = (req.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site') return false;

  const expectedHosts = new Set<string>();
  const fwdHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase();
  const hostHeader = req.headers.get('host')?.trim().toLowerCase();
  const nextHost = req.nextUrl.host?.trim().toLowerCase();
  if (fwdHost) expectedHosts.add(fwdHost);
  if (hostHeader) expectedHosts.add(hostHeader);
  if (nextHost) expectedHosts.add(nextHost);

  const origin = req.headers.get('origin')?.trim();
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      return expectedHosts.has(originHost);
    } catch {
      return false;
    }
  }

  const referer = req.headers.get('referer')?.trim();
  if (referer) {
    try {
      const refHost = new URL(referer).host.toLowerCase();
      return expectedHosts.has(refHost);
    } catch {
      return false;
    }
  }

  // Permintaan mutasi ber-cookie dari browser seharusnya selalu menyertakan Origin/Referer
  if (hasSession && secFetchSite !== 'same-origin') {
    return false;
  }

  return true;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith('/api/')) {
    if (!isSameOriginMutation(req, hasSession)) {
      return NextResponse.json({ error: 'Permintaan lintas-origin ditolak demi keamanan (CSRF).' }, { status: 403 });
    }
    if (PUBLIC_API.includes(pathname)) return NextResponse.next();
    // Pembacaan karakter/cerita publik diizinkan tanpa sesi; handler-nya tetap
    // memanggil requireUser untuk PUT/DELETE/POST dan menolak item privat
    if (isPublicBrowsePath(pathname)) return NextResponse.next();
    if (!hasSession) {
      return NextResponse.json({ error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Aset statis publik diloloskan lebih dulu; tanpa ini gambar halaman perkenalan
  // ikut dialihkan ke /login sehingga gagal dimuat oleh tamu
  if (PUBLIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Katalog dan detail karakter/cerita publik bisa dibuka tanpa akun
  if (isPublicBrowsePath(pathname)) return NextResponse.next();

  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)));
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
