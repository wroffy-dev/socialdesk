import { z } from 'zod';
import { db, type Tx } from '../db';
import { badRequest, conflict, notFound } from '../errors';
import { audit } from '../audit';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { upcomingSlotInstants } from '@/lib/time';
import { enqueuePublish, removePublishJobs } from '../queue/producer';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const slotsSchema = z.object({
  slots: z
    .array(z.object({ dayOfWeek: z.number().int().min(0).max(6), time: z.string().regex(TIME, 'Use HH:mm') }))
    .max(100),
});

/**
 * First weekly slot after `after` (workspace timezone) not already taken by another scheduled
 * post. Slots are workspace-wide; a slot holds one post.
 */
export async function nextFreeQueueSlot(tx: Tx, workspaceId: string, timezone: string, after: Date, excludePostId?: string) {
  const slots = await tx.queueSlot.findMany({ where: { workspaceId, socialAccountId: null }, select: { dayOfWeek: true, time: true } });
  const candidates = upcomingSlotInstants(slots, timezone, after, 200);
  if (candidates.length === 0) return null;
  const taken = await tx.socialPost.findMany({
    where: {
      workspaceId,
      status: { in: ['SCHEDULED', 'PUBLISHING'] },
      scheduledAt: { gte: candidates[0], lte: candidates[candidates.length - 1] },
      ...(excludePostId ? { id: { not: excludePostId } } : {}),
    },
    select: { scheduledAt: true },
  });
  const takenSet = new Set(taken.map((t) => t.scheduledAt!.getTime()));
  return candidates.find((c) => !takenSet.has(c.getTime())) ?? null;
}

export async function getQueue(ctx: WorkspaceCtx) {
  assertCan(ctx, 'posts.view');
  const wsId = ctx.workspace.id;
  const [settings, slots, queued] = await Promise.all([
    db.queueSettings.upsert({ where: { workspaceId: wsId }, create: { workspaceId: wsId }, update: {} }),
    db.queueSlot.findMany({ where: { workspaceId: wsId, socialAccountId: null }, orderBy: [{ dayOfWeek: 'asc' }, { time: 'asc' }] }),
    db.socialPost.findMany({
      where: { workspaceId: wsId, publishMode: 'QUEUE', status: 'SCHEDULED' },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
      select: {
        id: true,
        baseCaption: true,
        scheduledAt: true,
        versions: { select: { id: true, platform: true, caption: true, customized: true, socialAccount: { select: { id: true, name: true, avatarUrl: true, platform: true } } } },
      },
    }),
  ]);
  const upcomingFree = upcomingSlotInstants(slots, ctx.workspace.timezone, new Date(), 20).filter(
    (s) => !queued.some((q) => q.scheduledAt?.getTime() === s.getTime()),
  );
  return {
    paused: settings.paused,
    pausedAt: settings.pausedAt?.toISOString() ?? null,
    timezone: ctx.workspace.timezone,
    slots: slots.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek, time: s.time })),
    queued: queued.map((q) => ({
      id: q.id,
      caption: q.baseCaption || q.versions.find((v) => v.customized)?.caption || '',
      scheduledAt: q.scheduledAt!.toISOString(),
      channels: q.versions.map((v) => v.socialAccount),
    })),
    nextFreeSlots: upcomingFree.slice(0, 5).map((d) => d.toISOString()),
  };
}

export async function replaceSlots(ctx: WorkspaceCtx, input: z.infer<typeof slotsSchema>) {
  assertCan(ctx, 'queue.manage');
  const { slots } = slotsSchema.parse(input);
  const unique = [...new Map(slots.map((s) => [`${s.dayOfWeek}-${s.time}`, s])).values()];
  await db.$transaction([
    db.queueSlot.deleteMany({ where: { workspaceId: ctx.workspace.id, socialAccountId: null } }),
    db.queueSlot.createMany({ data: unique.map((s) => ({ ...s, workspaceId: ctx.workspace.id })) }),
  ]);
  await audit({ action: 'queue.slots_updated', actorId: ctx.user.id, workspaceId: ctx.workspace.id, metadata: { count: unique.length } });
  return getQueue(ctx);
}

/**
 * Pausing stops queued posts from publishing (the worker defers them). Resuming moves any
 * queued post whose slot passed during the pause to the next free slots, in order.
 */
export async function setQueuePaused(ctx: WorkspaceCtx, paused: boolean) {
  assertCan(ctx, 'queue.manage');
  const wsId = ctx.workspace.id;
  const changes = await db.$transaction(async (tx) => {
    await tx.queueSettings.upsert({
      where: { workspaceId: wsId },
      create: { workspaceId: wsId, paused, pausedAt: paused ? new Date() : null },
      update: { paused, pausedAt: paused ? new Date() : null },
    });
    if (paused) return { added: [], removed: [] };
    const overdue = await tx.socialPost.findMany({
      where: { workspaceId: wsId, publishMode: 'QUEUE', status: 'SCHEDULED', scheduledAt: { lt: new Date(Date.now() + 60_000) } },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true },
    });
    const added: { id: string; scheduledAt: Date }[] = [];
    const removed: { id: string; scheduledAt: Date | null }[] = [];
    let after = new Date(Date.now() + 60_000);
    for (const p of overdue) {
      await tx.$queryRaw`SELECT id FROM "PlatformPost" WHERE "postId" = ${p.id} FOR UPDATE`;
      const slot = await nextFreeQueueSlot(tx, wsId, ctx.workspace.timezone, after, p.id);
      if (!slot) break;
      const versions = await tx.platformPost.findMany({ where: { postId: p.id, status: 'SCHEDULED' } });
      await tx.platformPost.updateMany({ where: { postId: p.id, status: 'SCHEDULED' }, data: { scheduledAt: slot } });
      await tx.socialPost.update({ where: { id: p.id }, data: { scheduledAt: slot } });
      removed.push(...versions.map((v) => ({ id: v.id, scheduledAt: v.scheduledAt })));
      added.push(...versions.map((v) => ({ id: v.id, scheduledAt: slot })));
      after = slot;
    }
    return { added, removed };
  });
  await removePublishJobs(changes.removed);
  await enqueuePublish(changes.added);
  await audit({ action: paused ? 'queue.paused' : 'queue.resumed', actorId: ctx.user.id, workspaceId: wsId });
  return getQueue(ctx);
}

/** Swaps a queued post's slot with its neighbour (queue order). */
export async function moveInQueue(ctx: WorkspaceCtx, postId: string, direction: 'up' | 'down') {
  assertCan(ctx, 'posts.publish');
  const wsId = ctx.workspace.id;
  const changes = await db.$transaction(async (tx) => {
    const post = await tx.socialPost.findFirst({ where: { id: postId, workspaceId: wsId, publishMode: 'QUEUE', status: 'SCHEDULED' } });
    if (!post?.scheduledAt) throw notFound('Queued post');
    const neighbour = await tx.socialPost.findFirst({
      where: {
        workspaceId: wsId,
        publishMode: 'QUEUE',
        status: 'SCHEDULED',
        scheduledAt: direction === 'up' ? { lt: post.scheduledAt } : { gt: post.scheduledAt },
      },
      orderBy: { scheduledAt: direction === 'up' ? 'desc' : 'asc' },
    });
    if (!neighbour?.scheduledAt) throw badRequest(direction === 'up' ? 'This post is already first.' : 'This post is already last.');
    if (Math.min(post.scheduledAt.getTime(), neighbour.scheduledAt.getTime()) < Date.now() + 60_000) {
      throw conflict('One of these posts is about to publish and can no longer be moved.');
    }
    const added: { id: string; scheduledAt: Date }[] = [];
    const removed: { id: string; scheduledAt: Date | null }[] = [];
    for (const [p, at] of [
      [post, neighbour.scheduledAt],
      [neighbour, post.scheduledAt],
    ] as const) {
      await tx.$queryRaw`SELECT id FROM "PlatformPost" WHERE "postId" = ${p.id} FOR UPDATE`;
      const versions = await tx.platformPost.findMany({ where: { postId: p.id, status: 'SCHEDULED' } });
      await tx.platformPost.updateMany({ where: { postId: p.id, status: 'SCHEDULED' }, data: { scheduledAt: at } });
      await tx.socialPost.update({ where: { id: p.id }, data: { scheduledAt: at } });
      removed.push(...versions.map((v) => ({ id: v.id, scheduledAt: v.scheduledAt })));
      added.push(...versions.map((v) => ({ id: v.id, scheduledAt: at })));
    }
    return { added, removed };
  });
  await removePublishJobs(changes.removed);
  await enqueuePublish(changes.added);
  return getQueue(ctx);
}

export async function isQueuePaused(workspaceId: string, tx: Tx = db) {
  const s = await tx.queueSettings.findUnique({ where: { workspaceId } });
  return s?.paused ?? false;
}
