import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function deriveKey(secret?: string): Buffer | null {
  const raw = (secret ?? process.env.SETTINGS_ENCRYPTION_KEY ?? '').trim();
  if (!raw) return null;
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function isSettingsEncryptionEnabled(secret?: string): boolean {
  return deriveKey(secret) !== null;
}

export function isEncryptedValue(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Mengenkripsi nilai rahasia (seperti API Key) menggunakan AES-256-GCM bila
 * SETTINGS_ENCRYPTION_KEY diatur. Bila tidak diatur, nilai dikembalikan apa adanya
 * agar deployment lokal tetap berjalan tanpa konfigurasi tambahan.
 */
export function encryptSecret(plaintext: string, secretOverride?: string): string {
  if (!plaintext) return '';
  if (isEncryptedValue(plaintext)) return plaintext;
  const key = deriveKey(secretOverride);
  if (!key) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Mendekripsi nilai terenkripsi `enc:v1:...`. Nilai plaintext lama (sebelum enkripsi
 * diaktifkan) dikembalikan apa adanya untuk kompatibilitas mundur.
 */
export function decryptSecret(stored: string, secretOverride?: string): string {
  if (!stored) return '';
  if (!isEncryptedValue(stored)) return stored;

  const key = deriveKey(secretOverride);
  if (!key) {
    console.warn('[crypto] Nilai terenkripsi ditemukan tetapi SETTINGS_ENCRYPTION_KEY belum diatur.');
    return '';
  }

  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return '';

  try {
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const data = Buffer.from(parts[2], 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('[crypto] Gagal mendekripsi nilai setelan (periksa SETTINGS_ENCRYPTION_KEY):', err);
    return '';
  }
}
