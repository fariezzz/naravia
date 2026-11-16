/**
 * Pembersih dan penyaring sumber hasil riset karakter.
 *
 * Sumber disimpan sebagai string berformat "Judul: URL" agar tetap kompatibel
 * dengan karakter yang sudah tersimpan sebelumnya. Modul ini dipakai di semua
 * jalur riset supaya aturannya konsisten.
 */

export interface SumberRiset {
  judul: string;
  url: string;
  namaSitus: string;
}

export interface HasilPencarian {
  title?: string;
  url?: string;
  content?: string;
  description?: string;
}

export const MAKS_SUMBER = 5;

// Parameter yang hanya untuk pelacakan, bukan penentu tujuan tautan
const PARAM_PELACAK = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'yclid',
  'twclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'referrer',
  'fr',
  'soc_src',
  'soc_trk',
  'spm',
  'scid',
  'si',
  'share',
  'sh',
  'feature',
  '_ga',
  '_gl',
]);

const PREFIKS_PARAM_PELACAK = ['utm_', 'pk_', 'piwik_', 'hsa_', 'at_', 'mtm_'];

// Situs berita bisnis dan keuangan: sering lolos karena nama waralaba cocok,
// padahal isinya soal perusahaan penerbit, bukan karakternya
const DOMAIN_BISNIS = [
  'finance.yahoo.com',
  'bloomberg.com',
  'reuters.com',
  'cnbc.com',
  'marketwatch.com',
  'businesswire.com',
  'prnewswire.com',
  'investing.com',
  'seekingalpha.com',
  'forbes.com',
  'wsj.com',
  'ft.com',
  'benzinga.com',
  'barrons.com',
  'nasdaq.com',
  'fool.com',
  'simplywall.st',
  'stocktitan.net',
  'tipranks.com',
  'zacks.com',
];

// Kata kunci topik bisnis pada judul atau ringkasan
const KATA_BISNIS = [
  'saham',
  'stock',
  'shares',
  'earnings',
  'revenue',
  'investor',
  'ipo',
  'merger',
  'akuisisi',
  'acquisition',
  'quarterly',
  'kuartal',
  'market cap',
  'nasdaq',
  'nyse',
  'dividend',
  'valuation',
  'funding',
  'profit',
  'laba',
  'pendapatan',
  'analyst',
  'forecast',
  'guidance',
];

// Host yang dikenal sebagai wiki, dipakai untuk mencocokkan slug halaman karakter
const HOST_WIKI = ['wikipedia.org', 'fandom.com', 'wikia.org', 'gamepedia.com', 'miraheze.org', 'namu.wiki'];

/** Nama situs yang mudah dibaca, diturunkan dari host tautan. */
export function namaSitusDariUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');

    // Subdomain fandom adalah nama wikinya, misal honkai-star-rail.fandom.com
    if (host.endsWith('.fandom.com')) {
      const sub = host.slice(0, -'.fandom.com'.length);
      return `${sub.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Wiki`;
    }
    if (host.endsWith('wikipedia.org')) return 'Wikipedia';

    const inti = host.split('.')[0];
    return inti.charAt(0).toUpperCase() + inti.slice(1);
  } catch {
    return 'Sumber';
  }
}

/**
 * Menormalkan tautan untuk perbandingan: host huruf kecil, garis miring akhir
 * dirapikan, dan parameter pelacak dibuang. Tujuan tautan tidak diubah.
 */
export function normalkanUrl(url: string): string {
  const mentah = (url || '').trim();
  if (!mentah) return '';
  try {
    const u = new URL(mentah);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    u.hash = '';

    for (const kunci of Array.from(u.searchParams.keys())) {
      const k = kunci.toLowerCase();
      if (PARAM_PELACAK.has(k) || PREFIKS_PARAM_PELACAK.some((p) => k.startsWith(p))) {
        u.searchParams.delete(kunci);
      }
    }

    // Garis miring akhir dihapus, kecuali pada path akar
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }

    const query = u.searchParams.toString();
    return `${u.protocol}//${u.hostname}${u.pathname}${query ? `?${query}` : ''}`;
  } catch {
    return mentah.toLowerCase().replace(/\/+$/, '');
  }
}

/** Membentuk kembali string penyimpanan "Judul: URL". */
export function keStringSumber(s: SumberRiset): string {
  return s.url ? `${s.judul}: ${s.url}` : s.judul;
}

/** Membaca string penyimpanan menjadi objek sumber. Tautan boleh tidak ada. */
export function bacaStringSumber(entri: string): SumberRiset | null {
  const teks = (entri || '').trim();
  if (!teks) return null;

  const cocok = teks.match(/^(.*?):\s*(https?:\/\/\S+)$/i);
  if (cocok) {
    const judul = cocok[1].trim() || 'Sumber';
    const url = cocok[2].trim();
    return { judul, url, namaSitus: namaSitusDariUrl(url) };
  }

  const urlSaja = teks.match(/^(https?:\/\/\S+)$/i);
  if (urlSaja) {
    const url = urlSaja[1];
    return { judul: namaSitusDariUrl(url), url, namaSitus: namaSitusDariUrl(url) };
  }

  // Entri tanpa tautan, misalnya "Pengetahuan Model" atau "Teks Referensi Manual Pengguna"
  return { judul: teks, url: '', namaSitus: '' };
}

function lolosRegex(teks: string): string {
  return teks.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sebutNama(teks: string, nama: string): boolean {
  if (!nama || !teks) return false;
  return new RegExp(`\\b${lolosRegex(nama.toLowerCase())}\\b`).test(teks.toLowerCase());
}

function urlWiki(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return HOST_WIKI.some((w) => host === w || host.endsWith(`.${w}`));
  } catch {
    return false;
  }
}

/** Halaman wiki yang slug-nya cocok dengan nama karakter. */
function slugWikiCocok(url: string, nama: string): boolean {
  if (!nama || !urlWiki(url)) return false;
  try {
    const u = new URL(url);
    const segmen = decodeURIComponent(u.pathname).split('/').filter(Boolean).pop() || '';
    const slug = segmen.toLowerCase().replace(/[_+-]/g, ' ').replace(/\s+/g, ' ').trim();
    const namaBersih = nama.toLowerCase().trim();
    if (slug === namaBersih) return true;
    return new RegExp(`\\b${lolosRegex(namaBersih)}\\b`).test(slug);
  } catch {
    return false;
  }
}

function beritaBisnis(judul: string, ringkasan: string, url: string): boolean {
  const teks = `${judul} ${ringkasan}`.toLowerCase();
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    host = '';
  }
  const domainCocok = DOMAIN_BISNIS.some((d) => host === d || host.endsWith(`.${d}`));
  const kataCocok = KATA_BISNIS.some((k) => teks.includes(k));
  return domainCocok || kataCocok;
}

/** Skor relevansi, makin tinggi makin diutamakan saat diurutkan. */
function skorRelevansi(s: SumberRiset, ringkasan: string, nama: string): number {
  let skor = 0;
  if (slugWikiCocok(s.url, nama)) skor += 100;
  if (sebutNama(s.judul, nama)) skor += 40;
  if (sebutNama(ringkasan, nama)) skor += 15;
  if (urlWiki(s.url)) skor += 20;
  return skor;
}

/**
 * Membersihkan dan menyaring hasil pencarian menjadi daftar sumber yang layak
 * ditampilkan. Sumber yang dibuang dikembalikan terpisah untuk dicatat di log
 * server, tidak untuk ditampilkan ke pengguna.
 *
 * Sebuah hasil lolos bila judul atau ringkasannya menyebut nama karakter, atau
 * bila tautannya halaman wiki yang slug-nya cocok dengan nama karakter.
 */
export function saringHasilPencarian(
  hasil: HasilPencarian[],
  namaKarakter: string
): { sumber: SumberRiset[]; dibuang: Array<{ url: string; judul: string; alasan: string }> } {
  const nama = (namaKarakter || '').trim();
  const sumber: SumberRiset[] = [];
  const dibuang: Array<{ url: string; judul: string; alasan: string }> = [];
  const terlihat = new Set<string>();

  const berskor: Array<{ s: SumberRiset; skor: number }> = [];

  for (const r of hasil) {
    const url = (r.url || '').trim();
    const judul = (r.title || '').trim() || namaSitusDariUrl(url);
    const ringkasan = (r.content || r.description || '').trim();

    if (!url) {
      dibuang.push({ url: '', judul, alasan: 'tanpa tautan' });
      continue;
    }

    const kunci = normalkanUrl(url);
    if (terlihat.has(kunci)) {
      dibuang.push({ url, judul, alasan: 'duplikat' });
      continue;
    }

    const cocokNama = sebutNama(judul, nama) || sebutNama(ringkasan, nama);
    const cocokSlug = slugWikiCocok(url, nama);

    if (!cocokNama && !cocokSlug) {
      dibuang.push({ url, judul, alasan: 'tidak menyebut nama karakter' });
      continue;
    }

    // Berita bisnis dibuang kecuali memang membahas karakternya,
    // yaitu namanya disebut di judul atau halamannya wiki karakter itu
    if (beritaBisnis(judul, ringkasan, url) && !cocokSlug && !sebutNama(judul, nama)) {
      dibuang.push({ url, judul, alasan: 'berita bisnis atau keuangan, bukan tentang karakter' });
      continue;
    }

    terlihat.add(kunci);
    const bersih: SumberRiset = { judul, url: kunci, namaSitus: namaSitusDariUrl(url) };
    berskor.push({ s: bersih, skor: skorRelevansi(bersih, ringkasan, nama) });
  }

  berskor.sort((a, b) => b.skor - a.skor);
  for (const b of berskor.slice(0, MAKS_SUMBER)) sumber.push(b.s);

  for (const b of berskor.slice(MAKS_SUMBER)) {
    dibuang.push({ url: b.s.url, judul: b.s.judul, alasan: `melebihi batas ${MAKS_SUMBER} sumber` });
  }

  return { sumber, dibuang };
}

/**
 * Membersihkan daftar sumber yang sudah berbentuk string "Judul: URL".
 * Dipakai untuk daftar dari model dan untuk draf yang sudah ada, supaya
 * duplikat dan parameter pelacak tidak ikut tersimpan.
 */
export function bersihkanDaftarSumber(daftar: unknown, namaKarakter = ''): string[] {
  if (!Array.isArray(daftar)) return [];
  const nama = (namaKarakter || '').trim();
  const terlihat = new Set<string>();
  const hasil: string[] = [];

  for (const entri of daftar) {
    const s = bacaStringSumber(String(entri || ''));
    if (!s) continue;

    // Entri tanpa tautan (misalnya "Pengetahuan Model") dibiarkan apa adanya,
    // karena memang bukan tautan yang bisa dinormalkan
    if (!s.url) {
      const kunci = `teks:${s.judul.toLowerCase()}`;
      if (terlihat.has(kunci)) continue;
      terlihat.add(kunci);
      hasil.push(s.judul);
      continue;
    }

    const kunci = normalkanUrl(s.url);
    if (terlihat.has(kunci)) continue;

    // Saringan relevansi hanya diterapkan bila nama karakter diketahui
    if (nama && !sebutNama(s.judul, nama) && !slugWikiCocok(s.url, nama)) continue;

    terlihat.add(kunci);
    hasil.push(keStringSumber({ ...s, url: kunci }));
  }

  return hasil.slice(0, MAKS_SUMBER);
}

/** Mengubah daftar string penyimpanan menjadi objek untuk ditampilkan. */
export function bacaDaftarSumber(daftar: unknown): SumberRiset[] {
  if (!Array.isArray(daftar)) return [];
  return daftar
    .map((e) => bacaStringSumber(String(e || '')))
    .filter((s): s is SumberRiset => Boolean(s));
}
