import { Queue } from 'bullmq';
import { createBullConnection } from '../redis';
import { QUEUES, publishJobId, type PublishJobData } from './names';

const g = globalThis as unknown as { publishQueue?: Queue<PublishJobData> };

export function publishQueue(): Queue<PublishJobData> {
  if (!g.publishQueue) {
    g.publishQueue = new Queue<PublishJobData>(QUEUES.publish, {
      connection: createBullConnection(),
      defaultJobOptions: {
        // Retries are driven by the database (see worker/publisher.ts), not BullMQ.
        attempts: 1,
        removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    });
  }
  return g.publishQueue;
}

const disabled = () => process.env.PUBLISH_QUEUE_DISABLED === 'true';

/**
 * Adds delayed publish jobs. PostgreSQL stays the source of truth: if Redis is unavailable the
 * error is logged and the worker's reconciler enqueues the due versions later.
 */
export async function enqueuePublish(items: { id: string; scheduledAt: Date }[]) {
  if (disabled() || items.length === 0) return;
  try {
    const q = publishQueue();
    await q.addBulk(
      items.map((i) => ({
        name: 'publish',
        data: { platformPostId: i.id, scheduledAt: i.scheduledAt.toISOString() },
        opts: { jobId: publishJobId(i.id, i.scheduledAt), delay: Math.max(0, i.scheduledAt.getTime() - Date.now()) },
      })),
    );
  } catch (err) {
    console.error('[queue] enqueue failed; reconciler will retry', err instanceof Error ? err.message : err);
  }
}

/** Best-effort removal of a superseded delayed job. The worker ignores stale jobs anyway. */
export async function removePublishJobs(items: { id: string; scheduledAt: Date | null }[]) {
  if (disabled()) return;
  try {
    const q = publishQueue();
    await Promise.all(
      items.filter((i) => i.scheduledAt).map(async (i) => {
        const job = await q.getJob(publishJobId(i.id, i.scheduledAt!));
        if (job && (await job.isDelayed())) await job.remove();
      }),
    );
  } catch (err) {
    console.error('[queue] remove failed', err instanceof Error ? err.message : err);
  }
}
