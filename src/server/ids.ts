import { randomBytes } from 'node:crypto';

/** Collision-resistant, URL-safe, roughly time-ordered id (cuid-like). */
export function createId(): string {
  return `c${Date.now().toString(36)}${randomBytes(9).toString('base64url').replace(/[-_]/g, '0').toLowerCase()}`;
}
