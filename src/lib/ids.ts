import { randomBytes } from 'node:crypto';

// ID acak yang tidak bisa ditebak, dengan awalan jenis entitas agar mudah dibaca di log
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
}
