import { redis } from './redis';
import { tooManyRequests } from './errors';

const memory = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Fixed-window limiter backed by Redis. Falls back to per-process memory if Redis is
 * unreachable so a Redis outage does not take sign-in down with it.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const k = `rl:${key}`;
  try {
    const r = redis();
    const results = await r.multi().incr(k).expire(k, windowSec, 'NX').ttl(k).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? windowSec);
    return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec: ttl > 0 ? ttl : windowSec };
  } catch {
    const now = Date.now();
    const entry = memory.get(k);
    if (!entry || entry.resetAt <= now) {
      memory.set(k, { count: 1, resetAt: now + windowSec * 1000 });
      return { ok: true, remaining: limit - 1, retryAfterSec: windowSec };
    }
    entry.count += 1;
    return {
      ok: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSec: number) {
  if (process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') return;
  const res = await rateLimit(key, limit, windowSec);
  if (!res.ok) throw tooManyRequests(res.retryAfterSec);
}

export async function resetRateLimit(key: string) {
  memory.delete(`rl:${key}`);
  try {
    await redis().del(`rl:${key}`);
  } catch {
    /* ignore */
  }
}
