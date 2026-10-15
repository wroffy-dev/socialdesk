import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { redis } from '@/server/redis';

export const dynamic = 'force-dynamic';

/** Liveness/readiness for Coolify. Reports dependency status without leaking details. */
export async function GET() {
  const checks: Record<string, boolean> = { database: false, redis: false, worker: false };
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = true;
    const beat = await db.workerHeartbeat.findFirst({ orderBy: { lastBeatAt: 'desc' } });
    checks.worker = !!beat && Date.now() - beat.lastBeatAt.getTime() < 120_000;
  } catch {
    /* reported below */
  }
  try {
    checks.redis = (await Promise.race([redis().ping(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2000))])) === 'PONG';
  } catch {
    /* reported below */
  }
  // The web app can serve requests without the worker, so only DB failures make it unhealthy.
  const ok = checks.database;
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
