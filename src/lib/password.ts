import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Hash password memakai scrypt bawaan Node (tanpa dependensi native)
const KEY_LENGTH = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK = 8;
const SCRYPT_PARALLEL = 1;

function scryptAsync(password: string, salt: Buffer, keylen: number, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keylen,
      { N: cost, r: SCRYPT_BLOCK, p: SCRYPT_PARALLEL, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_COST);
  return `scrypt$${SCRYPT_COST}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const cost = parseInt(parts[1], 10);
  if (!Number.isFinite(cost) || cost < 1024) return false;
  const salt = Buffer.from(parts[2], 'base64');
  const expected = Buffer.from(parts[3], 'base64');
  const actual = await scryptAsync(password, salt, expected.length, cost);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Aturan kekuatan password minimal
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (password.length > 128) return 'Kata sandi maksimal 128 karakter.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Kata sandi harus mengandung huruf dan angka.';
  }
  return null;
}
