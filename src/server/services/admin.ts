import { z } from 'zod';
import { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { badRequest, notFound } from '../errors';
import { audit } from '../audit';
import { createBullConnection } from '../redis';
import { QUEUES } from '../queue/names';
import { ENTITLEMENT_KEYS } from '../billing/catalog';
import { removePublishJobs } from '../queue/producer';
import { refreshPostStatus } from '../publishing/status';

type Admin = { id: string };
const PAGE = 25;

// ---------------------------------------------------------------------------
// Overview & monitoring
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { adminQueues?: Record<string, Queue> };
function queue(name: string) {
  g.adminQueues ??= {};
  g.adminQueues[name] ??= new Queue(name, { connection: createBullConnection() });
  return g.adminQueues[name]!;
}

export async function queueStats() {
  const out: Record<string, Record<string, number> | { error: string }> = {};
  for (const name of Object.values(QUEUES)) {
    try {
      out[name] = await Promise.race([
        queue(name).getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Redis did not respond')), 3000)),
      ]);
    } catch (err) {
      out[name] = { error: (err as Error).message };
    }
  }
  return out;
}

export async function getOverview() {
  const day = new Date(Date.now() - 24 * 3600_000);
  const week = new Date(Date.now() - 7 * 24 * 3600_000);
  const [users, newUsers, workspaces, suspended, subs, channels, reauth, published24, published7, failed24, verify, scheduled, heartbeats, failedJobs, queues] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: week } } }),
    db.workspace.count(),
    db.workspace.count({ where: { status: 'SUSPENDED' } }),
    db.subscription.groupBy({ by: ['planId'], _count: { _all: true } }),
    db.socialAccount.count({ where: { status: { not: 'DISCONNECTED' } } }),
    db.socialAccount.count({ where: { status: { in: ['NEEDS_REAUTH', 'ERROR'] } } }),
    db.platformPost.count({ where: { status: 'PUBLISHED', publishedAt: { gte: day } } }),
    db.platformPost.count({ where: { status: 'PUBLISHED', publishedAt: { gte: week } } }),
    db.platformPost.count({ where: { status: 'FAILED', updatedAt: { gte: day } } }),
    db.platformPost.count({ where: { status: 'NEEDS_VERIFICATION' } }),
    db.platformPost.count({ where: { status: 'SCHEDULED' } }),
    db.workerHeartbeat.findMany({ orderBy: { lastBeatAt: 'desc' } }),
    db.failedJob.count({ where: { failedAt: { gte: day } } }),
    queueStats(),
  ]);
  const plans = await db.plan.findMany({ select: { id: true, name: true } });
  return {
    users: { total: users, newThisWeek: newUsers },
    workspaces: { total: workspaces, suspended },
    subscriptions: subs.map((s) => ({ plan: plans.find((p) => p.id === s.planId)?.name ?? s.planId, count: s._count._all })),
    channels: { connected: channels, needsAttention: reauth },
    publishing: { published24h: published24, published7d: published7, failed24h: failed24, needsVerification: verify, scheduled },
    workers: heartbeats.map((h) => ({ id: h.id, hostname: h.hostname, pid: h.pid, startedAt: h.startedAt.toISOString(), lastBeatAt: h.lastBeatAt.toISOString(), healthy: Date.now() - h.lastBeatAt.getTime() < 90_000 })),
    failedJobs24h: failedJobs,
    queues,
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsers(q: string | undefined, page = 1) {
  const where: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {};
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, email: true, name: true, status: true, isSuperAdmin: true, emailVerified: true, lastLoginAt: true, createdAt: true, _count: { select: { memberships: true } } },
    }),
  ]);
  return { total, page, pageSize: PAGE, items: rows };
}

export async function setUserStatus(admin: Admin, userId: string, status: 'ACTIVE' | 'SUSPENDED') {
  if (userId === admin.id) throw badRequest("You can't change your own status.");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User');
  await db.user.update({
    where: { id: userId },
    // Suspending also revokes every session.
    data: { status, ...(status === 'SUSPENDED' ? { sessionVersion: { increment: 1 } } : {}) },
  });
  await audit({ action: `admin.user_${status.toLowerCase()}`, actorId: admin.id, targetType: 'user', targetId: userId });
}

export async function revokeUserSessions(admin: Admin, userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  await audit({ action: 'admin.user_sessions_revoked', actorId: admin.id, targetType: 'user', targetId: userId });
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export async function listWorkspaces(q: string | undefined, page = 1) {
  const where: Prisma.WorkspaceWhereInput = q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] } : {};
  const [total, rows] = await Promise.all([
    db.workspace.count({ where }),
    db.workspace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        suspendReason: true,
        createdAt: true,
        subscription: { select: { status: true, provider: true, plan: { select: { key: true, name: true } } } },
        members: { where: { role: 'OWNER' }, take: 1, select: { user: { select: { email: true } } } },
        _count: { select: { members: true, projects: true, socialAccounts: { where: { status: { not: 'DISCONNECTED' } } }, posts: true } },
      },
    }),
  ]);
  return { total, page, pageSize: PAGE, items: rows };
}

export async function setWorkspaceStatus(admin: Admin, workspaceId: string, status: 'ACTIVE' | 'SUSPENDED', reason?: string) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) throw notFound('Workspace');
  let cancelled: { id: string; scheduledAt: Date | null }[] = [];
  await db.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { status, suspendedAt: status === 'SUSPENDED' ? new Date() : null, suspendReason: status === 'SUSPENDED' ? (reason ?? null) : null },
    });
    if (status === 'SUSPENDED') {
      // Nothing may publish from a suspended workspace.
      const versions = await tx.platformPost.findMany({ where: { workspaceId, status: 'SCHEDULED' } });
      await tx.platformPost.updateMany({ where: { id: { in: versions.map((v) => v.id) } }, data: { status: 'CANCELLED', lastError: 'Workspace suspended.' } });
      for (const postId of new Set(versions.map((v) => v.postId))) await refreshPostStatus(postId, tx);
      cancelled = versions.map((v) => ({ id: v.id, scheduledAt: v.scheduledAt }));
    }
  });
  await removePublishJobs(cancelled);
  await audit({ action: `admin.workspace_${status.toLowerCase()}`, actorId: admin.id, workspaceId, metadata: { reason: reason ?? null, cancelled: cancelled.length } });
  return { cancelledPosts: cancelled.length };
}

/** Manual plan assignment (e.g. beta partners). Doesn't touch a paid Razorpay subscription. */
export async function setWorkspacePlan(admin: Admin, workspaceId: string, planKey: string) {
  const plan = await db.plan.findUnique({ where: { key: planKey } });
  if (!plan) throw notFound('Plan');
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  if (sub?.provider === 'RAZORPAY') throw badRequest('This workspace has a paid subscription. Change it through Razorpay.');
  await db.subscription.upsert({
    where: { workspaceId },
    create: { workspaceId, planId: plan.id, status: 'ACTIVE', provider: 'NONE' },
    update: { planId: plan.id, status: 'ACTIVE' },
  });
  await audit({ action: 'admin.workspace_plan_set', actorId: admin.id, workspaceId, metadata: { plan: planKey } });
}

// ---------------------------------------------------------------------------
// Plans & entitlements
// ---------------------------------------------------------------------------

export async function listAllPlans() {
  return db.plan.findMany({ orderBy: { sortOrder: 'asc' }, include: { entitlements: true, _count: { select: { subscriptions: true } } } });
}

export const planUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().max(200).nullable(),
  priceAmount: z.number().int().min(0).max(100_000_000),
  currency: z.string().length(3),
  razorpayPlanId: z.string().max(60).nullable(),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  sortOrder: z.number().int().min(0).max(100),
  entitlements: z.array(
    z.object({
      key: z.enum(Object.values(ENTITLEMENT_KEYS) as [string, ...string[]]),
      enabled: z.boolean(),
      limit: z.number().int().min(0).max(1_000_000).nullable(),
    }),
  ),
});

export async function updatePlan(admin: Admin, planId: string, input: z.infer<typeof planUpdateSchema>) {
  const data = planUpdateSchema.parse(input);
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) throw notFound('Plan');
  if (plan.key === 'free' && !data.isActive) throw badRequest('The free plan must stay active; it is the fallback for every workspace.');
  await db.$transaction(async (tx) => {
    await tx.plan.update({
      where: { id: planId },
      data: {
        name: data.name,
        description: data.description,
        priceAmount: data.priceAmount,
        currency: data.currency.toUpperCase(),
        razorpayPlanId: data.razorpayPlanId || null,
        isActive: data.isActive,
        isPublic: data.isPublic,
        sortOrder: data.sortOrder,
      },
    });
    for (const e of data.entitlements) {
      await tx.entitlement.upsert({
        where: { planId_key: { planId, key: e.key } },
        create: { planId, key: e.key, enabled: e.enabled, limit: e.limit },
        update: { enabled: e.enabled, limit: e.limit },
      });
    }
  });
  await audit({ action: 'admin.plan_updated', actorId: admin.id, targetType: 'plan', targetId: planId, metadata: data as unknown as Prisma.InputJsonValue });
}

// ---------------------------------------------------------------------------
// Publishing & integrations
// ---------------------------------------------------------------------------

export async function listPublishingProblems() {
  const rows = await db.platformPost.findMany({
    where: { status: { in: ['FAILED', 'NEEDS_VERIFICATION'] } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      postId: true,
      status: true,
      platform: true,
      lastError: true,
      lastErrorCode: true,
      attemptCount: true,
      updatedAt: true,
      workspace: { select: { name: true, slug: true } },
      socialAccount: { select: { name: true } },
    },
  });
  const byCode = await db.platformPost.groupBy({
    by: ['lastErrorCode'],
    where: { status: 'FAILED', updatedAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } },
    _count: { _all: true },
    orderBy: { _count: { lastErrorCode: 'desc' } },
    take: 10,
  });
  return { items: rows, topErrors: byCode.map((b) => ({ code: b.lastErrorCode ?? 'unknown', count: b._count._all })) };
}

export async function listIntegrationHealth() {
  const [accounts, syncErrors, modes] = await Promise.all([
    db.socialAccount.findMany({
      where: { status: { in: ['NEEDS_REAUTH', 'ERROR'] } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, name: true, platform: true, status: true, mode: true, lastError: true, lastCheckedAt: true, workspace: { select: { name: true, slug: true } } },
    }),
    db.integrationSyncState.findMany({
      where: { lastError: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { kind: true, lastError: true, updatedAt: true, socialAccount: { select: { name: true, platform: true, workspace: { select: { name: true } } } } },
    }),
    db.socialAccount.groupBy({ by: ['mode', 'platform'], where: { status: { not: 'DISCONNECTED' } }, _count: { _all: true } }),
  ]);
  return { accounts, syncErrors, modes: modes.map((m) => ({ mode: m.mode, platform: m.platform, count: m._count._all })) };
}

export async function listFailedJobs() {
  return db.failedJob.findMany({ orderBy: { failedAt: 'desc' }, take: 100 });
}

// ---------------------------------------------------------------------------
// Audit & content
// ---------------------------------------------------------------------------

export async function listGlobalAudit(cursor?: string) {
  const rows = await db.auditLog.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { actor: { select: { name: true, email: true } }, workspace: { select: { name: true } } },
  });
  const page = rows.slice(0, 50);
  return {
    items: page.map((r) => ({
      id: r.id,
      action: r.action,
      actor: r.actor ? (r.actor.name ?? r.actor.email) : 'System',
      workspace: r.workspace?.name ?? null,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > 50 ? page[page.length - 1]!.id : null,
  };
}

export const contentSchema = z.object({ title: z.string().trim().min(1).max(120), body: z.string().max(100_000) });

export async function updateSiteContent(admin: Admin, key: string, input: z.infer<typeof contentSchema>) {
  if (!['terms', 'privacy'].includes(key)) throw notFound('Page');
  const data = contentSchema.parse(input);
  await db.siteContent.upsert({ where: { key }, create: { key, ...data }, update: data });
  await audit({ action: 'admin.content_updated', actorId: admin.id, targetType: 'site_content', targetId: key });
}
