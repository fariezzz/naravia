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
 * Halaman dan endpoint karakter publik boleh dibuka tamu. Middleware tidak bisa
 * membedakan metode HTTP secara andal untuk otorisasi, jadi setiap handler yang
 * mengubah data (POST/PUT/DELETE) tetap memanggil requireUser sendiri.
 * Yang diloloskan di sini hanya pembacaan satu karakter dan katalog publik.
 */
function isPublicCharacterPath(pathname: string): boolean {
  if (pathname === '/jelajah') return true;
  if (pathname === '/api/characters/public') return true;

  // /characters/<id> dan /api/characters/<id>, tetapi bukan sub-route lain di
  // bawah /characters/ yang kebetulan berbentuk satu segmen dan tetap butuh sesi
  const SEGMEN_BUKAN_ID = ['new', 'public', 'visited'];
  const detail = pathname.match(/^(?:\/api)?\/characters\/([^/]+)$/);
  if (detail && !SEGMEN_BUKAN_ID.includes(detail[1])) return true;

  return false;
}
const PUBLIC_API = ['/api/auth/login', '/api/auth/register', '/api/auth/config', '/api/auth/logout', '/api/health'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith('/api/')) {
    if (PUBLIC_API.includes(pathname)) return NextResponse.next();
    // Pembacaan karakter publik diizinkan tanpa sesi; handler-nya tetap
    // memanggil requireUser untuk PUT/DELETE
    if (isPublicCharacterPath(pathname)) return NextResponse.next();
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

  // Katalog dan profil karakter publik bisa dibuka tanpa akun
  if (isPublicCharacterPath(pathname)) return NextResponse.next();

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
