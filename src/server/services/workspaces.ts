import { z } from 'zod';
import { db } from '../db';
import { badRequest, limitReached } from '../errors';
import { audit } from '../audit';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { isValidTimezone } from '@/lib/timezones';
import { DEFAULT_PLAN_KEY } from '../billing/catalog';
import { getWorkspacePlan, workspaceAllowance } from './entitlements';

export const workspaceInputSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters').max(60),
  timezone: z.string().refine(isValidTimezone, 'Choose a valid timezone'),
});

export const workspaceUpdateSchema = workspaceInputSchema.partial().extend({
  logoUrl: z.string().url().max(500).nullable().optional(),
});

const RESERVED = new Set(['new', 'admin', 'api', 'settings', 'login', 'signup', 'app', 'w']);

export function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length >= 2 && !RESERVED.has(base) ? base : `workspace-${base}`.replace(/-+$/, '');
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await db.workspace.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new Error('Could not allocate a workspace slug');
}

/** Default weekly queue: weekdays at 09:30 and 18:00 in the workspace timezone. */
const DEFAULT_SLOTS = [1, 2, 3, 4, 5].flatMap((day) => [
  { dayOfWeek: day, time: '09:30' },
  { dayOfWeek: day, time: '18:00' },
]);

export async function createWorkspace(userId: string, input: z.infer<typeof workspaceInputSchema>) {
  const data = workspaceInputSchema.parse(input);
  const allowance = await workspaceAllowance(userId);
  if (allowance.limit !== null && allowance.owned >= allowance.limit) {
    throw limitReached(
      `Your plan allows you to own ${allowance.limit} workspace${allowance.limit === 1 ? '' : 's'}. Upgrade a workspace to create more.`,
      { key: 'workspaces', limit: allowance.limit, current: allowance.owned },
    );
  }
  const slug = await uniqueSlug(data.name);
  const freePlan = await db.plan.findUnique({ where: { key: DEFAULT_PLAN_KEY } });
  if (!freePlan) throw new Error(`Plan "${DEFAULT_PLAN_KEY}" not found. Run the database seed.`);

  const workspace = await db.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name: data.name,
        slug,
        timezone: data.timezone,
        createdById: userId,
        members: { create: { userId, role: 'OWNER' } },
        subscription: { create: { planId: freePlan.id, status: 'ACTIVE', provider: 'NONE' } },
        queueSettings: { create: {} },
        queueSlots: { createMany: { data: DEFAULT_SLOTS } },
        notificationPrefs: { create: { userId } },
      },
    });
    await audit({ action: 'workspace.created', actorId: userId, workspaceId: ws.id, targetType: 'workspace', targetId: ws.id }, tx);
    return ws;
  });
  return workspace;
}

export async function listUserWorkspaces(userId: string) {
  const rows = await db.workspaceMember.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      workspace: {
        select: { id: true, slug: true, name: true, logoUrl: true, status: true, subscription: { select: { plan: { select: { name: true } } } } },
      },
    },
  });
  return rows.map((r) => ({
    id: r.workspace.id,
    slug: r.workspace.slug,
    name: r.workspace.name,
    logoUrl: r.workspace.logoUrl,
    status: r.workspace.status,
    role: r.role,
    planName: r.workspace.subscription?.plan.name ?? 'Free',
  }));
}

export async function updateWorkspace(ctx: WorkspaceCtx, input: z.infer<typeof workspaceUpdateSchema>) {
  assertCan(ctx, 'workspace.update');
  const data = workspaceUpdateSchema.parse(input);
  const ws = await db.workspace.update({
    where: { id: ctx.workspace.id },
    data: { name: data.name, timezone: data.timezone, logoUrl: data.logoUrl },
    select: { id: true, slug: true, name: true, timezone: true, logoUrl: true },
  });
  await audit({ action: 'workspace.updated', actorId: ctx.user.id, workspaceId: ws.id, metadata: data });
  return ws;
}

export async function deleteWorkspace(ctx: WorkspaceCtx, confirmName: string) {
  assertCan(ctx, 'workspace.delete');
  if (confirmName.trim() !== ctx.workspace.name) throw badRequest('Type the workspace name exactly to confirm.');
  const sub = await db.subscription.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (sub && sub.provider !== 'NONE' && ['ACTIVE', 'PAST_DUE', 'TRIALING'].includes(sub.status)) {
    throw badRequest('Cancel the paid subscription before deleting this workspace.');
  }
  await audit({ action: 'workspace.deleted', actorId: ctx.user.id, metadata: { workspaceId: ctx.workspace.id, name: ctx.workspace.name } });
  await db.workspace.delete({ where: { id: ctx.workspace.id } });
}

export async function workspaceSummary(ctx: WorkspaceCtx) {
  const plan = await getWorkspacePlan(ctx.workspace.id);
  return { ...ctx.workspace, role: ctx.role, plan: { key: plan.planKey, name: plan.planName } };
}
