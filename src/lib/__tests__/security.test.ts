import { describe, expect, it } from 'vitest';
import { isSafeUploadFilename, uploadFilenameFromUrl } from '../assets';
import { sanitizePersonalizationText } from '../metaFilter';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../password';
import { checkRateLimit, resetRateLimit } from '../rateLimit';

describe('Security, password, rate-limit, upload safety & metaFilter', () => {
  it('hashes and verifies passwords with scrypt', async () => {
    const hash = await hashPassword('Rahasia123');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Rahasia123', hash)).toBe(true);
    expect(await verifyPassword('Salah123', hash)).toBe(false);
  });

  it('validates password strength rules', () => {
    expect(validatePasswordStrength('abc12')).not.toBeNull();
    expect(validatePasswordStrength('abcdefgh')).not.toBeNull();
    expect(validatePasswordStrength('12345678')).not.toBeNull();
    expect(validatePasswordStrength('Naravia2026')).toBeNull();
  });

  it('enforces and resets in-memory rate limits', () => {
    const key = `test-rl-${Date.now()}`;
    expect(checkRateLimit(key, 2, 10_000).ok).toBe(true);
    expect(checkRateLimit(key, 2, 10_000).ok).toBe(true);
    expect(checkRateLimit(key, 2, 10_000).ok).toBe(false);
    resetRateLimit(key);
    expect(checkRateLimit(key, 2, 10_000).ok).toBe(true);
  });

  it('blocks directory traversal in upload filenames and URLs', () => {
    expect(isSafeUploadFilename('avatar-123.webp')).toBe(true);
    expect(isSafeUploadFilename('../.env.local')).toBe(false);
    expect(isSafeUploadFilename('.hidden')).toBe(false);
    expect(isSafeUploadFilename('sub/file.png')).toBe(false);
    expect(uploadFilenameFromUrl('/uploads/avatar-123.webp')).toBe('avatar-123.webp');
    expect(uploadFilenameFromUrl('/uploads/../../etc/passwd')).toBeNull();
    expect(uploadFilenameFromUrl('https://example.com/a.png')).toBeNull();
  });

  it('strips leaked AI meta sentences from character fields', () => {
    const input =
      'Deskripsi: Nagi adalah gitaris band millsage. Informasi yang tersedia dalam bahan pencarian belum memuat rincian profil resmi lainnya.';
    const res = sanitizePersonalizationText(input);
    expect(res.cleaned).toBe('Nagi adalah gitaris band millsage.');
    expect(res.removedCount).toBeGreaterThanOrEqual(1);
  });
});
