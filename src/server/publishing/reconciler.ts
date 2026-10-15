import { db } from '../db';
import { env } from '../env';
import { adapterFor } from '../adapters/registry';
import { enqueuePublish } from '../queue/producer';
import { refreshPostStatus } from './status';
import { accountRef } from '../integrations/tokens';
import { buildPublishInput } from './input';
import { postFirstComment } from './first-comment';

const STALE_LOCK_MS = 15 * 60_000;
const VERIFY_WINDOW_MS = 48 * 3600_000;

/**
 * Makes PostgreSQL the source of truth for scheduling. Run every minute by the worker:
 * - re-enqueues due versions whose Redis job was lost (Redis restart, failed enqueue)
 * - recovers versions stuck in PUBLISHING after a worker crash
 * - auto-verifies versions whose publish outcome was unknown
 */
export async function reconcile(now = new Date()) {
  const stats = { enqueued: 0, recovered: 0, verified: 0, cleaned: 0 };

  // 1. Due (or nearly due) scheduled versions. Re-adding an existing job id is a no-op, and the
  //    database claim makes duplicate jobs harmless. Overdue ones get a fresh job id per minute
  //    in case their original job was already consumed.
  const due = await db.platformPost.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: new Date(now.getTime() + 2 * 60_000) },
      // Queued posts wait while their workspace's queue is paused.
      NOT: { post: { publishMode: 'QUEUE' }, workspace: { queueSettings: { paused: true } } },
    },
    select: { id: true, scheduledAt: true },
    take: 500,
  });
  if (due.length) {
    const minute = Math.floor(now.getTime() / 60_000) * 60_000;
    await enqueuePublish(
      due.map((d) => ({ id: d.id, scheduledAt: d.scheduledAt!.getTime() < now.getTime() - 60_000 ? new Date(minute) : d.scheduledAt! })),
    );
    stats.enqueued = due.length;
  }

  // 2. Versions a crashed worker left in PUBLISHING.
  const stale = await db.platformPost.findMany({
    where: { status: 'PUBLISHING', lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
  });
  for (const v of stale) {
    const last = v.attempts[0];
    const finalCallStarted = !!(last?.responseMeta as { finalCallAt?: string } | null)?.finalCallAt;
    await db.$transaction(async (tx) => {
      const res = await tx.platformPost.updateMany({
        where: { id: v.id, status: 'PUBLISHING', lockedAt: v.lockedAt },
        data: finalCallStarted
          ? { status: 'NEEDS_VERIFICATION', lastError: 'The worker stopped while publishing. Checking whether the post went live.', lockedAt: null, lockedBy: null }
          : { status: 'SCHEDULED', scheduledAt: now, lockedAt: null, lockedBy: null },
      });
      if (res.count && last) {
        await tx.publishingAttempt.update({
          where: { id: last.id },
          data: { status: finalCallStarted ? 'AMBIGUOUS' : 'FAILED', finishedAt: now, errorCode: 'worker_lost', errorMessage: 'Worker stopped during the attempt.' },
        });
      }
      await refreshPostStatus(v.postId, tx);
    });
    if (!finalCallStarted) await enqueuePublish([{ id: v.id, scheduledAt: now }]);
    stats.recovered++;
  }

  // 3. Ask the platform whether ambiguous publishes went live.
  const unknown = await db.platformPost.findMany({
    where: { status: 'NEEDS_VERIFICATION', updatedAt: { gt: new Date(now.getTime() - VERIFY_WINDOW_MS) } },
    include: { socialAccount: true, attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
    take: 50,
  });
  for (const v of unknown) {
    if (v.socialAccount.status !== 'CONNECTED') continue;
    try {
      const { input } = await buildPublishInput(v.id);
      const since = new Date((v.attempts[0]?.startedAt ?? v.updatedAt).getTime() - 2 * 60_000);
      const outcome = await adapterFor(v.socialAccount).verifyPublish({ ...input, account: await accountRef(v.socialAccount) }, since);
      if (outcome.status === 'unknown') continue;
      await db.$transaction(async (tx) => {
        if (outcome.status === 'published') {
          const res = await tx.platformPost.updateMany({
            where: { id: v.id, status: 'NEEDS_VERIFICATION' },
            data: { status: 'PUBLISHED', externalId: outcome.externalId, externalUrl: outcome.externalUrl, publishedAt: now, lastError: null },
          });
          if (res.count) {
            const { incrementUsage } = await import('../services/entitlements');
            await incrementUsage(v.workspaceId, 'posts_published', 1, tx);
          }
        } else if (v.attemptCount < env().PUBLISH_MAX_ATTEMPTS) {
          // Confirmed not live: safe to retry automatically.
          await tx.platformPost.updateMany({ where: { id: v.id, status: 'NEEDS_VERIFICATION' }, data: { status: 'SCHEDULED', scheduledAt: now, lastError: null } });
        } else {
          await tx.platformPost.updateMany({ where: { id: v.id, status: 'NEEDS_VERIFICATION' }, data: { status: 'FAILED', lastError: 'Confirmed not published after the maximum number of attempts.' } });
        }
        await refreshPostStatus(v.postId, tx);
      });
      if (outcome.status === 'not_published' && v.attemptCount < env().PUBLISH_MAX_ATTEMPTS) await enqueuePublish([{ id: v.id, scheduledAt: now }]);
      if (outcome.status === 'published') await postFirstComment(v.id).catch((e) => console.error('[reconcile] first comment failed', e));
      stats.verified++;
    } catch (err) {
      console.error('[reconcile] verification failed', v.id, (err as Error).message);
    }
  }

  // 4. Housekeeping.
  const [states, pendings] = await Promise.all([
    db.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 3600_000) } } }),
    db.pendingConnection.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  stats.cleaned = states.count + pendings.count;
  return stats;
}
