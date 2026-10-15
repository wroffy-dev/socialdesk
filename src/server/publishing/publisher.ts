import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { env } from '../env';
import { redis } from '../redis';
import { adapterFor } from '../adapters/registry';
import { AdapterError } from '../adapters/types';
import { enqueuePublish } from '../queue/producer';
import { validatePostVersions } from '../services/posts';
import { incrementUsage } from '../services/entitlements';
import { isQueuePaused } from '../services/queue';
import { notifyPublishProblem } from '../services/notifications';
import { refreshPostStatus } from './status';
import { buildPublishInput } from './input';
import { errorsOnly } from '@/lib/platforms';

export type PublishOutcome =
  | 'published'
  | 'retry_scheduled'
  | 'failed'
  | 'needs_verification'
  | 'skipped_not_due'
  | 'skipped_paused'
  | 'deferred_account_busy';

/** Clock skew tolerance between the scheduler and the database. */
const DUE_TOLERANCE_MS = 5_000;
const ACCOUNT_LOCK_MS = 10 * 60_000;

/** Backoff for transient failures: 1m, 5m, 15m, 45m … (or the platform's Retry-After). */
export function retryDelayMs(attempt: number, retryAfterSec?: number) {
  if (retryAfterSec) return Math.max(retryAfterSec * 1000, 30_000);
  const steps = [60_000, 5 * 60_000, 15 * 60_000, 45 * 60_000, 2 * 3600_000];
  return steps[Math.min(attempt - 1, steps.length - 1)]!;
}

async function acquireAccountLock(accountId: string, owner: string) {
  if (process.env.PUBLISH_ACCOUNT_LOCK === 'off') return true;
  try {
    return (await redis().set(`lock:publish:${accountId}`, owner, 'PX', ACCOUNT_LOCK_MS, 'NX')) === 'OK';
  } catch {
    // Redis down: the database claim below still guarantees a single publish per version.
    return true;
  }
}

async function releaseAccountLock(accountId: string, owner: string) {
  if (process.env.PUBLISH_ACCOUNT_LOCK === 'off') return;
  try {
    // Only delete our own lock.
    await redis().eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, `lock:publish:${accountId}`, owner);
  } catch {
    /* lock expires on its own */
  }
}

/**
 * Publishes one channel version. Safe to call any number of times for the same version:
 * only a caller that atomically moves it from SCHEDULED to PUBLISHING does any work.
 */
export async function processPublish(platformPostId: string, opts: { workerId: string; trigger?: string }): Promise<PublishOutcome> {
  const pre = await db.platformPost.findUnique({
    where: { id: platformPostId },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      socialAccountId: true,
      workspaceId: true,
      post: { select: { id: true, publishMode: true } },
      workspace: { select: { status: true } },
    },
  });
  if (!pre || pre.status !== 'SCHEDULED' || !pre.scheduledAt || pre.scheduledAt.getTime() > Date.now() + DUE_TOLERANCE_MS) return 'skipped_not_due';
  if (pre.post.publishMode === 'QUEUE' && (await isQueuePaused(pre.workspaceId))) return 'skipped_paused';

  if (!(await acquireAccountLock(pre.socialAccountId, opts.workerId))) {
    // Another version for this account is publishing; try again shortly without using an attempt.
    await enqueuePublish([{ id: pre.id, scheduledAt: new Date(Date.now() + 20_000) }]);
    return 'deferred_account_busy';
  }

  try {
    // The claim: exactly one worker can win this conditional update.
    const claimed = await db.platformPost.updateMany({
      where: { id: pre.id, status: 'SCHEDULED', scheduledAt: { lte: new Date(Date.now() + DUE_TOLERANCE_MS) } },
      data: { status: 'PUBLISHING', lockedAt: new Date(), lockedBy: opts.workerId, attemptCount: { increment: 1 }, nextRetryAt: null },
    });
    if (claimed.count !== 1) return 'skipped_not_due';

    const version = await db.platformPost.findUniqueOrThrow({ where: { id: pre.id } });
    const attempt = await db.publishingAttempt.create({
      data: { workspaceId: version.workspaceId, platformPostId: version.id, attemptNumber: version.attemptCount, trigger: opts.trigger ?? 'schedule', workerId: opts.workerId },
    });
    await refreshPostStatus(version.postId);

    let finalCallStarted = false;
    const fail = async (err: AdapterError) => handleFailure(version.id, attempt.id, err, finalCallStarted);

    if (pre.workspace.status !== 'ACTIVE') {
      return fail(new AdapterError('permanent', 'The workspace is suspended, so nothing was published.', 'workspace_suspended'));
    }

    // Re-validate at publish time: media may have been deleted or the account disconnected.
    const issues = (await validatePostVersions(version.postId)).find((x) => x.socialAccountId === version.socialAccountId);
    const blocking = issues ? errorsOnly(issues.issues) : [];
    if (blocking.length) {
      const authProblem = blocking.some((i) => /reconnect|permission/i.test(i.message));
      return fail(new AdapterError(authProblem ? 'auth' : 'permanent', blocking[0]!.message, authProblem ? 'account_unavailable' : 'validation'));
    }

    const { input, mode } = await buildPublishInput(version.id);
    if (mode === 'MOCK' && env().NODE_ENV === 'production' && process.env.ALLOW_MOCK_IN_PRODUCTION !== 'true') {
      return fail(new AdapterError('permanent', 'Mock channels cannot publish in production.', 'mock_in_production'));
    }

    try {
      const adapter = adapterFor({ platform: version.platform, mode });
      const result = await adapter.publish(input, {
        saveState: async (state) => {
          await db.platformPost.update({ where: { id: version.id }, data: { providerState: state as Prisma.InputJsonValue } });
        },
        beforeFinalCall: async () => {
          finalCallStarted = true;
          await db.publishingAttempt.update({ where: { id: attempt.id }, data: { responseMeta: { finalCallAt: new Date().toISOString() } } });
        },
      });
      await db.$transaction(async (tx) => {
        await tx.platformPost.update({
          where: { id: version.id },
          data: {
            status: 'PUBLISHED',
            externalId: result.externalId,
            externalUrl: result.externalUrl,
            publishedAt: new Date(),
            lastError: null,
            lastErrorCode: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
        await tx.publishingAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCEEDED', finishedAt: new Date(), responseMeta: { externalId: result.externalId } } });
        await incrementUsage(version.workspaceId, 'posts_published', 1, tx);
        await refreshPostStatus(version.postId, tx);
      });
      return 'published';
    } catch (err) {
      const e =
        err instanceof AdapterError
          ? err
          : // An unexpected error after the final request started could mean the post is live.
            new AdapterError(finalCallStarted ? 'ambiguous' : 'transient', (err as Error)?.message ?? 'Unexpected error', 'internal');
      if (!(err instanceof AdapterError)) console.error('[publisher] unexpected error', err);
      return fail(e);
    }
  } finally {
    await releaseAccountLock(pre.socialAccountId, opts.workerId);
  }
}

async function handleFailure(versionId: string, attemptId: string, err: AdapterError, finalCallStarted: boolean): Promise<PublishOutcome> {
  const version = await db.platformPost.findUniqueOrThrow({ where: { id: versionId } });
  const maxAttempts = env().PUBLISH_MAX_ATTEMPTS;
  // A transient error after the final call started is still ambiguous.
  const kind = err.kind === 'transient' && finalCallStarted ? 'ambiguous' : err.kind;
  const message = err.message.slice(0, 1000);
  let outcome: PublishOutcome;
  let retryAt: Date | null = null;

  await db.$transaction(async (tx) => {
    await tx.publishingAttempt.update({
      where: { id: attemptId },
      data: {
        status: kind === 'ambiguous' ? 'AMBIGUOUS' : 'FAILED',
        finishedAt: new Date(),
        errorCode: err.code ?? null,
        errorMessage: message,
        retryable: kind === 'transient',
      },
    });
    if (kind === 'transient' && version.attemptCount < maxAttempts) {
      retryAt = new Date(Date.now() + retryDelayMs(version.attemptCount, err.retryAfterSec));
      await tx.platformPost.update({
        where: { id: versionId },
        data: { status: 'SCHEDULED', scheduledAt: retryAt, nextRetryAt: retryAt, lastError: message, lastErrorCode: err.code ?? null, lockedAt: null, lockedBy: null },
      });
      outcome = 'retry_scheduled';
    } else if (kind === 'ambiguous') {
      await tx.platformPost.update({
        where: { id: versionId },
        data: { status: 'NEEDS_VERIFICATION', lastError: message, lastErrorCode: err.code ?? null, lockedAt: null, lockedBy: null },
      });
      outcome = 'needs_verification';
    } else {
      await tx.platformPost.update({
        where: { id: versionId },
        data: {
          status: 'FAILED',
          lastError: kind === 'transient' ? `${message} (gave up after ${version.attemptCount} attempts)` : message,
          lastErrorCode: err.code ?? null,
          lockedAt: null,
          lockedBy: null,
        },
      });
      if (kind === 'auth') {
        await tx.socialAccount.update({ where: { id: version.socialAccountId }, data: { status: 'NEEDS_REAUTH', lastError: message } });
      }
      outcome = 'failed';
    }
    await refreshPostStatus(version.postId, tx);
  });

  if (retryAt) await enqueuePublish([{ id: versionId, scheduledAt: retryAt }]);
  if (outcome! === 'failed' || outcome! === 'needs_verification') {
    await notifyPublishProblem(versionId).catch((e) => console.error('[publisher] notification failed', e));
  }
  return outcome!;
}
