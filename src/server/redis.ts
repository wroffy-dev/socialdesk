import IORedis, { type Redis } from 'ioredis';

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Shared connection for rate limiting and other short commands. */
export function redis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      // Commands issued while (re)connecting wait briefly instead of failing immediately;
      // after 2 retries they fail and callers fall back (e.g. the in-memory rate limiter).
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
      connectTimeout: 5_000,
    });
    globalForRedis.redis.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') console.error('[redis]', err.message);
    });
  }
  return globalForRedis.redis;
}

/** BullMQ requires `maxRetriesPerRequest: null` on blocking connections. */
export function createBullConnection(): Redis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
}
