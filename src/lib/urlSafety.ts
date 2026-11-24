import dns from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from './http';

const ALWAYS_BLOCKED_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
  'db',
]);

function normalizeIp(rawIp: string): string {
  const trimmed = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (trimmed.startsWith('::ffff:')) {
    const mapped = trimmed.slice('::ffff:'.length);
    if (net.isIP(mapped) === 4) return mapped;
  }
  return trimmed;
}

function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : -1));
  if (nums.some((n) => n < 0 || n > 255)) return null;
  return [nums[0], nums[1], nums[2], nums[3]];
}

/**
 * IP yang selalu berbahaya (metadata cloud, link-local, unspecified, multicast),
 * termasuk pada konfigurasi lokal.
 */
export function isAlwaysBlockedIp(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  const ipv4 = parseIpv4(ip);
  if (ipv4) {
    const [a, b] = ipv4;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (AWS/GCP/Azure metadata & link-local)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT / Alibaba metadata 100.100.100.200)
    if (a >= 224) return true; // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved
    return false;
  }

  if (net.isIP(ip) === 6) {
    if (ip === '::' || ip === '0:0:0:0:0:0:0:0') return true;
    if (/^fe[89ab][0-9a-f]:/i.test(ip) || /^fe[89ab][0-9a-f]$/i.test(ip)) return true; // fe80::/10 link-local
    if (ip.startsWith('ff')) return true; // ff00::/8 multicast
  }
  return false;
}

/**
 * IP loopback dan jaringan privat RFC1918 / ULA.
 */
export function isPrivateOrLoopbackIp(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  const ipv4 = parseIpv4(ip);
  if (ipv4) {
    const [a, b] = ipv4;
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    return false;
  }

  if (net.isIP(ip) === 6) {
    if (ip === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true; // fc00::/7 unique local
  }
  return false;
}

export function isSameOriginUrl(urlA: string | null | undefined, urlB: string | null | undefined): boolean {
  if (!urlA || !urlB) return false;
  try {
    return new URL(urlA.trim()).origin.toLowerCase() === new URL(urlB.trim()).origin.toLowerCase();
  } catch {
    return false;
  }
}

function allowPrivateUrlsByDefault(): boolean {
  if (process.env.ALLOW_PRIVATE_LLM_URLS === 'true') return true;
  if (process.env.ALLOW_PRIVATE_LLM_URLS === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

export function assertSafeProviderUrlSync(
  rawUrl: string,
  options?: { allowPrivate?: boolean }
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new HttpError(400, 'Format Base URL tidak valid.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Base URL harus menggunakan protokol http:// atau https://.');
  }
  if (parsed.username || parsed.password) {
    throw new HttpError(400, 'Base URL tidak boleh menyertakan kredensial user/password di dalam URL.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) {
    throw new HttpError(400, 'Hostname Base URL tidak valid.');
  }
  if (ALWAYS_BLOCKED_HOSTS.has(host) || host.endsWith('.metadata.google.internal')) {
    throw new HttpError(400, 'Alamat host tersebut tidak diizinkan demi keamanan jaringan.');
  }
  if (parsed.port === '5432') {
    throw new HttpError(400, 'Port layanan database internal tidak diizinkan.');
  }

  const allowPrivate = options?.allowPrivate ?? allowPrivateUrlsByDefault();
  if (!allowPrivate && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))) {
    throw new HttpError(
      400,
      'Alamat lokal/privat tidak diizinkan di produksi (atur ALLOW_PRIVATE_LLM_URLS=true di .env bila memakai gateway lokal).'
    );
  }

  if (net.isIP(host)) {
    if (isAlwaysBlockedIp(host)) {
      throw new HttpError(400, 'Alamat IP metadata/khusus tidak diizinkan.');
    }
    if (!allowPrivate && isPrivateOrLoopbackIp(host)) {
      throw new HttpError(
        400,
        'Alamat IP privat/loopback tidak diizinkan di produksi (atur ALLOW_PRIVATE_LLM_URLS=true di .env bila memakai gateway lokal).'
      );
    }
  }

  return parsed;
}

/**
 * Validasi penuh URL keluar (termasuk resolusi DNS) untuk mencegah SSRF ke jaringan internal/metadata.
 */
export async function assertSafeProviderUrl(
  rawUrl: string,
  options?: { allowPrivate?: boolean; skipDns?: boolean }
): Promise<URL> {
  const parsed = assertSafeProviderUrlSync(rawUrl, options);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const allowPrivate = options?.allowPrivate ?? allowPrivateUrlsByDefault();

  if (options?.skipDns || net.isIP(host)) {
    return parsed;
  }

  let resolved: Array<{ address: string }>;
  try {
    resolved = await dns.lookup(host, { all: true });
  } catch {
    throw new HttpError(400, 'Host Base URL tidak dapat ditemukan melalui DNS.');
  }

  if (resolved.length === 0) {
    throw new HttpError(400, 'Host Base URL tidak mengembalikan alamat IP yang valid.');
  }

  for (const record of resolved) {
    if (isAlwaysBlockedIp(record.address)) {
      throw new HttpError(400, 'Host Base URL mengarah ke alamat IP metadata/khusus yang diblokir.');
    }
    if (!allowPrivate && isPrivateOrLoopbackIp(record.address)) {
      throw new HttpError(
        400,
        'Host Base URL mengarah ke jaringan privat/loopback yang diblokir di produksi (atur ALLOW_PRIVATE_LLM_URLS=true bila diperlukan).'
      );
    }
  }

  return parsed;
}
