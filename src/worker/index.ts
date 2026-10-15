/**
 * Background worker: a separate process from the web app.
 *   development: npm run dev:worker
 *   production:  node dist/worker.cjs   (built by `npm run build:worker`)
 */
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { env } from '../server/env';
import { db } from '../server/db';
import { createBullConnection, redis } from '../server/redis';
import { QUEUES, type PublishJobData } from '../server/queue/names';
import { processPublish } from '../server/publishing/publisher';
import { reconcile } from '../server/publishing/reconciler';
import { runMaintenanceTask, MAINTENANCE_SCHEDULE, type MaintenanceTask } from './maintenance';

const e = env();
const workerId = `${hostname()}-${process.pid}-${randomBytes(3).toString('hex')}`;
const startedAt = new Date();
const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', worker: workerId, msg, ...extra }));
const logError = (msg: string, err: unknown, extra?: Record<string, unknown>) =>
  console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', worker: workerId, msg, error: err instanceof Error ? err.message : String(err), ...extra }));

async function recordFailedJob(queue: string, job: Job | undefined, err: Error) {
  try {
    await db.failedJob.create({
      data: {
        queue,
        jobId: job?.id ?? null,
        name: job?.name ?? 'unknown',
        workspaceId: null,
        payload: (job?.data ?? null) as Prisma.InputJsonValue,
        error: `${err.message}\n${err.stack ?? ''}`.slice(0, 8000),
        attempts: job?.attemptsMade ?? 0,
      },
    });
  } catch (dbErr) {
    logError('could not record failed job', dbErr);
  }
}

const publishWorker = new Worker<PublishJobData>(
  QUEUES.publish,
  async (job) => {
    const outcome = await processPublish(job.data.platformPostId, { workerId, trigger: 'schedule' });
    log('publish job', { job: job.id, version: job.data.platformPostId, outcome });
    return outcome;
  },
  {
    connection: createBullConnection(),
    concurrency: e.WORKER_CONCURRENCY,
    // Instagram video processing can take minutes; keep the job lock alive meanwhile.
    lockDuration: 10 * 60_000,
    // Never let BullMQ re-run a stalled publish job: the reconciler decides based on DB state.
    maxStalledCount: 0,
  },
);

const maintenanceWorker = new Worker<{ task: MaintenanceTask }>(
  QUEUES.maintenance,
  async (job) => {
    const started = Date.now();
    const result = await runMaintenanceTask(job.data.task);
    log('maintenance', { task: job.data.task, ms: Date.now() - started, result });
    return result;
  },
  { connection: createBullConnection(), concurrency: 1, lockDuration: 15 * 60_000 },
);

for (const [name, w] of [
  [QUEUES.publish, publishWorker],
  [QUEUES.maintenance, maintenanceWorker],
] as const) {
  w.on('failed', (job, err) => {
    logError('job failed', err, { queue: name, job: job?.id });
    void recordFailedJob(name, job, err);
  });
  w.on('error', (err) => logError('worker error', err, { queue: name }));
}

const maintenanceQueue = new Queue(QUEUES.maintenance, {
  connection: createBullConnection(),
  defaultJobOptions: { removeOnComplete: { count: 200 }, removeOnFail: { count: 500 } },
});

async function registerSchedules() {
  for (const [task, repeat] of Object.entries(MAINTENANCE_SCHEDULE) as [MaintenanceTask, { every: number } | { pattern: string }][]) {
    await maintenanceQueue.upsertJobScheduler(`sched-${task}`, repeat, { name: task, data: { task } });
  }
}

let lastBeat = new Date();
async function heartbeat() {
  lastBeat = new Date();
  await db.workerHeartbeat.upsert({
    where: { id: workerId },
    create: { id: workerId, hostname: hostname(), pid: process.pid, startedAt, lastBeatAt: lastBeat, info: { concurrency: e.WORKER_CONCURRENCY } },
    update: { lastBeatAt: lastBeat },
  });
}

// Liveness for Docker/Coolify: healthy while the heartbeat loop and Redis are alive.
const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
const health = createServer(async (req, res) => {
  if (req.url !== '/healthz') {
    res.writeHead(404).end();
    return;
  }
  const fresh = Date.now() - lastBeat.getTime() < 90_000;
  let redisOk = false;
  try {
    redisOk = (await redis().ping()) === 'PONG';
  } catch {
    /* unhealthy */
  }
  const ok = fresh && redisOk && publishWorker.isRunning();
  res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok, workerId, redis: redisOk, lastBeat }));
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down', { signal });
  const force = setTimeout(() => {
    logError('forced exit after timeout', new Error('shutdown timeout'));
    process.exit(1);
  }, 60_000);
  try {
    // close() waits for in-flight jobs so a publish is never cut off mid-request.
    await Promise.all([publishWorker.close(), maintenanceWorker.close()]);
    await maintenanceQueue.close();
    health.close();
    await db.workerHeartbeat.delete({ where: { id: workerId } }).catch(() => undefined);
    await db.$disconnect();
    clearTimeout(force);
    process.exit(0);
  } catch (err) {
    logError('error during shutdown', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logError('unhandled rejection', err));

async function main() {
  await db.$queryRaw`SELECT 1`;
  await heartbeat();
  setInterval(() => void heartbeat().catch((err) => logError('heartbeat failed', err)), 30_000);
  await registerSchedules();
  health.listen(healthPort, () => log('health endpoint listening', { port: healthPort }));
  // Catch up immediately after a restart instead of waiting for the first scheduled run.
  const stats = await reconcile();
  log('worker started', { concurrency: e.WORKER_CONCURRENCY, metaMode: e.META_MODE, reconcile: stats });
}

main().catch((err) => {
  logError('worker failed to start', err);
  process.exit(1);
});
