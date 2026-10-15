import { db, type Tx } from '../db';
import { limitReached } from '../errors';
import { DEFAULT_PLAN_KEY, ENTITLEMENT_LABEL, type EntitlementKey } from '../billing/catalog';

export interface WorkspacePlan {
  planId: string;
  planKey: string;
  planName: string;
  status: string;
  /** limit null = unlimited; enabled false = feature unavailable */
  entitlements: Map<string, { limit: number | null; enabled: boolean }>;
}

/** Statuses in which paid entitlements apply. Anything else falls back to the free plan. */
const ENTITLED_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);

export async function getWorkspacePlan(workspaceId: string, tx: Tx = db): Promise<WorkspacePlan> {
  const sub = await tx.subscription.findUnique({
    where: { workspaceId },
    include: { plan: { include: { entitlements: true } } },
  });
  let plan = sub && ENTITLED_STATUSES.has(sub.status) ? sub.plan : null;
  if (!plan) {
    plan = await tx.plan.findUnique({ where: { key: DEFAULT_PLAN_KEY }, include: { entitlements: true } });
  }
  if (!plan) throw new Error(`Default plan "${DEFAULT_PLAN_KEY}" is missing. Run the database seed.`);
  return {
    planId: plan.id,
    planKey: plan.key,
    planName: plan.name,
    status: sub?.status ?? 'ACTIVE',
    entitlements: new Map(plan.entitlements.map((e) => [e.key, { limit: e.limit, enabled: e.enabled }])),
  };
}

export function limitOf(plan: WorkspacePlan, key: EntitlementKey): number | null {
  const e = plan.entitlements.get(key);
  if (!e) return 0;
  if (!e.enabled) return 0;
  return e.limit;
}

export function featureEnabled(plan: WorkspacePlan, key: EntitlementKey): boolean {
  return plan.entitlements.get(key)?.enabled ?? false;
}

/** Throws 402 when adding `adding` more units would exceed the plan limit. */
export function assertWithinLimit(plan: WorkspacePlan, key: EntitlementKey, current: number, adding = 1) {
  const limit = limitOf(plan, key);
  if (limit === null) return;
  if (current + adding > limit) {
    throw limitReached(
      `Your ${plan.planName} plan allows ${limit} ${ENTITLEMENT_LABEL[key].toLowerCase()}. Upgrade to add more.`,
      { key, limit, current },
    );
  }
}

export function assertFeature(plan: WorkspacePlan, key: EntitlementKey) {
  if (!featureEnabled(plan, key)) {
    throw limitReached(`${ENTITLEMENT_LABEL[key]} is not included in the ${plan.planName} plan.`, { key });
  }
}

export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export async function getUsage(workspaceId: string, metric: string, tx: Tx = db, at = new Date()) {
  const row = await tx.usageRecord.findUnique({
    where: { workspaceId_metric_periodStart: { workspaceId, metric, periodStart: monthStart(at) } },
  });
  return row?.count ?? 0;
}

export async function incrementUsage(workspaceId: string, metric: string, by = 1, tx: Tx = db, at = new Date()) {
  const periodStart = monthStart(at);
  await tx.usageRecord.upsert({
    where: { workspaceId_metric_periodStart: { workspaceId, metric, periodStart } },
    create: { workspaceId, metric, periodStart, count: by },
    update: { count: { increment: by } },
  });
}

/** Number of workspaces a user owns, and the most generous workspace allowance across them. */
export async function workspaceAllowance(userId: string, tx: Tx = db) {
  const owned = await tx.workspaceMember.findMany({ where: { userId, role: 'OWNER' }, select: { workspaceId: true } });
  let best: number | null = 0;
  const free = await tx.plan.findUnique({ where: { key: DEFAULT_PLAN_KEY }, include: { entitlements: true } });
  const freeLimit = free?.entitlements.find((e) => e.key === 'workspaces')?.limit ?? 1;
  best = freeLimit;
  for (const { workspaceId } of owned) {
    const plan = await getWorkspacePlan(workspaceId, tx);
    const l = limitOf(plan, 'workspaces');
    if (l === null) {
      best = null;
      break;
    }
    if (best !== null && l > best) best = l;
  }
  return { owned: owned.length, limit: best };
}
