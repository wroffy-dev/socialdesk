import { createHmac, timingSafeEqual } from 'node:crypto';

/** Parses and verifies a Meta `signed_request` (HMAC-SHA256 with the app secret). */
export function parseSignedRequest(signed: string, appSecret: string): Record<string, unknown> | null {
  const [sig, payload] = signed.split('.', 2);
  if (!sig || !payload) return null;
  const expected = createHmac('sha256', appSecret).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data?.algorithm?.toUpperCase() === 'HMAC-SHA256' ? data : null;
  } catch {
    return null;
  }
}
