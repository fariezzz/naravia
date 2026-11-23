import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, isEncryptedValue, isSettingsEncryptionEnabled } from '../crypto';

describe('crypto (AES-256-GCM settings encryption)', () => {
  const secret = 'kunci-rahasia-naravia-super-aman-32bytes';

  it('encrypts and decrypts secrets round-trip when key is configured', () => {
    const plain = 'sk-live-secret-api-key-12345';
    const enc = encryptSecret(plain, secret);
    expect(enc).not.toBe(plain);
    expect(isEncryptedValue(enc)).toBe(true);
    expect(decryptSecret(enc, secret)).toBe(plain);
  });

  it('produces different ciphertext each time due to random IV', () => {
    const plain = 'same-api-key';
    const enc1 = encryptSecret(plain, secret);
    const enc2 = encryptSecret(plain, secret);
    expect(enc1).not.toBe(enc2);
    expect(decryptSecret(enc1, secret)).toBe(plain);
    expect(decryptSecret(enc2, secret)).toBe(plain);
  });

  it('passes through plaintext when no encryption key is set', () => {
    expect(isSettingsEncryptionEnabled('')).toBe(false);
    expect(encryptSecret('plain-key', '')).toBe('plain-key');
    expect(decryptSecret('plain-key', '')).toBe('plain-key');
  });

  it('keeps backward compatibility with legacy plaintext values even when key is enabled', () => {
    expect(decryptSecret('legacy-unencrypted-key', secret)).toBe('legacy-unencrypted-key');
  });

  it('returns empty string safely when decrypting with wrong key', () => {
    const enc = encryptSecret('top-secret', secret);
    expect(decryptSecret(enc, 'kunci-lain-yang-salah')).toBe('');
  });
});
