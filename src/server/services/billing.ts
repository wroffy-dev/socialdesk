import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { env } from '../env';
import { badRequest, conflict, notFound } from '../errors';
import { audit } from '../audit';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { DEFAULT_PLAN_KEY, ENTITLEMENT_KEYS, ENTITLEMENT_LABEL, type EntitlementKey } from '../billing/catalog';
import { cancelSubscription, createSubscription } from '../billing/razorpay';
import { getUsage, getWorkspacePlan, limitOf, workspaceAllowance } from './entitlements';

export async function listPublicPlans() {
  const plans = await db.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: 'asc' }, include: { entitlements: true } });
  return plans.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    priceAmount: p.priceAmount,
    currency: p.currency,
    interval: p.interval,
    purchasable: !!p.razorpayPlanId && p.priceAmount > 0,
    entitlements: Object.values(ENTITLEMENT_KEYS).map((key) => {
      const e = p.entitlements.find((x) => x.key === key);
      return { key, label: ENTITLEMENT_LABEL[key], enabled: e?.enabled ?? false, limit: e?.limit ?? null };
    }),
  }));
}

export async function getBilling(ctx: WorkspaceCtx) {
  assertCan(ctx, 'billing.view');
  const wsId = ctx.workspace.id;
  const [plan, sub, projects, members, pendingInvites, published, scheduledThisMonth, owned, invoices, payments, plans] = await Promise.all([
    getWorkspacePlan(wsId),
    db.subscription.findUnique({ where: { workspaceId: wsId }, include: { plan: true } }),
    db.project.count({ where: { workspaceId: wsId } }),
    db.workspaceMember.count({ where: { workspaceId: wsId } }),
    db.invitation.count({ where: { workspaceId: wsId, status: 'PENDING', expiresAt: { gt: new Date() } } }),
    getUsage(wsId, 'posts_published'),
    (() => {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return db.platformPost.count({ where: { workspaceId: wsId, status: { in: ['SCHEDULED', 'PUBLISHING'] }, scheduledAt: { gte: start, lt: end } } });
    })(),
    workspaceAllowance(ctx.user.id),
    db.invoice.findMany({ where: { workspaceId: wsId }, orderBy: { issuedAt: 'desc' }, take: 24 }),
    db.payment.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: 'desc' }, take: 24 }),
    listPublicPlans(),
  ]);
  const usage = (key: EntitlementKey, used: number) => ({ key, label: ENTITLEMENT_LABEL[key], used, limit: limitOf(plan, key) });
  return {
    billingEnabled: env().BILLING_ENABLED,
    plan: { key: plan.planKey, name: plan.planName },
    subscription: sub
      ? {
          status: sub.status,
          provider: sub.provider,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          pendingPlanId: sub.pendingPlanId,
        }
      : null,
    usage: [
      usage('projects', projects),
      usage('team_members', members + pendingInvites),
      usage('posts_per_month', published + scheduledThisMonth),
      { key: 'workspaces', label: ENTITLEMENT_LABEL.workspaces, used: owned.owned, limit: owned.limit },
    ],
    features: { analyticsExport: plan.entitlements.get('analytics_export')?.enabled ?? false, analyticsHistoryDays: limitOf(plan, 'analytics_history_days') },
    plans,
    invoices: invoices.map((i) => ({ id: i.id, amount: i.amount, currency: i.currency, status: i.status, issuedAt: i.issuedAt.toISOString(), paidAt: i.paidAt?.toISOString() ?? null, url: i.url })),
    payments: payments.map((p) => ({ id: p.id, amount: p.amount, currency: p.currency, status: p.status, method: p.method, createdAt: p.createdAt.toISOString() })),
  };
}

/**
 * Starts a Razorpay subscription for a paid plan. The workspace is NOT upgraded here: only a
 * verified webhook (subscription.activated / subscription.charged) changes the plan.
 */
export async function startCheckout(ctx: WorkspaceCtx, planKey: string) {
  assertCan(ctx, 'billing.manage');
  if (!env().BILLING_ENABLED) throw badRequest('Paid plans are not available yet. Everyone is on free beta access for now.');
  const plan = await db.plan.findUnique({ where: { key: planKey } });
  if (!plan || !plan.isActive || !plan.razorpayPlanId || plan.priceAmount <= 0) throw notFound('Plan');
  const sub = await db.subscription.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (sub?.provider === 'RAZORPAY' && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(sub.status) && sub.planId !== (await defaultPlanId())) {
    throw conflict('This workspace already has a paid subscription. Cancel it before switching plans.');
  }
  const rp = await createSubscription(plan.razorpayPlanId, { workspaceId: ctx.workspace.id, planKey: plan.key });
  await db.subscription.upsert({
    where: { workspaceId: ctx.workspace.id },
    create: { workspaceId: ctx.workspace.id, planId: await defaultPlanId(), providerSubscriptionId: rp.id, pendingPlanId: plan.id, status: 'ACTIVE' },
    update: { providerSubscriptionId: rp.id, pendingPlanId: plan.id },
  });
  await audit({ action: 'billing.checkout_started', actorId: ctx.user.id, workspaceId: ctx.workspace.id, metadata: { plan: plan.key, subscription: rp.id } });
  return { subscriptionId: rp.id, keyId: env().RAZORPAY_KEY_ID!, shortUrl: rp.short_url ?? null, planName: plan.name, amount: plan.priceAmount, currency: plan.currency };
}

export async function cancelPaidSubscription(ctx: WorkspaceCtx) {
  assertCan(ctx, 'billing.manage');
  const sub = await db.subscription.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (!sub?.providerSubscriptionId || sub.provider !== 'RAZORPAY') throw badRequest('There is no paid subscription to cancel.');
  await cancelSubscription(sub.providerSubscriptionId, true);
  await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
  await audit({ action: 'billing.cancel_requested', actorId: ctx.user.id, workspaceId: ctx.workspace.id });
}

let defaultPlanCache: string | undefined;
async function defaultPlanId() {
  if (!defaultPlanCache) defaultPlanCache = (await db.plan.findUniqueOrThrow({ where: { key: DEFAULT_PLAN_KEY } })).id;
  return defaultPlanCache;
}

// ---------------------------------------------------------------------------
// Webhooks (already signature-verified by the route)
// ---------------------------------------------------------------------------

interface RpEvent {
  event: string;
  payload: {
    subscription?: { entity: { id: string; plan_id: string; status: string; current_start: number | null; current_end: number | null; notes?: Record<string, string> } };
    payment?: { entity: { id: string; amount: number; currency: string; status: string; method?: string; invoice_id?: string | null; subscription_id?: string | null } };
    invoice?: { entity: { id: string; amount: number; currency: string; status: string; subscription_id?: string | null; short_url?: string; paid_at?: number | null; issued_at?: number | null } };
  };
}

const ts = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

export async function processRazorpayEvent(eventId: string, raw: unknown) {
  const ev = raw as RpEvent;
  // Idempotency: each event id is processed once.
  const existing = await db.webhookEvent.findUnique({ where: { provider_eventId: { provider: 'razorpay', eventId } } });
  if (existing?.processedAt) return { duplicate: true };
  const record =
    existing ??
    (await db.webhookEvent.create({ data: { provider: 'razorpay', eventId, type: ev.event, payload: raw as Prisma.InputJsonValue, signatureValid: true } }));

  try {
    const subEntity = ev.payload.subscription?.entity;
    const subId = subEntity?.id ?? ev.payload.payment?.entity.subscription_id ?? ev.payload.invoice?.entity.subscription_id ?? null;
    const sub = subId ? await db.subscription.findUnique({ where: { providerSubscriptionId: subId } }) : null;

    switch (ev.event) {
      case 'subscription.authenticated':
        break;
      case 'subscription.activated':
      case 'subscription.charged':
      case 'subscription.resumed': {
        if (!sub || !subEntity) break;
        const plan = (sub.pendingPlanId && (await db.plan.findUnique({ where: { id: sub.pendingPlanId } }))) || (await db.plan.findFirst({ where: { razorpayPlanId: subEntity.plan_id } }));
        if (!plan) throw new Error(`No plan for Razorpay plan ${subEntity.plan_id}`);
        await db.subscription.update({
          where: { id: sub.id },
          data: {
            planId: plan.id,
            pendingPlanId: null,
            provider: 'RAZORPAY',
            status: 'ACTIVE',
            currentPeriodStart: ts(subEntity.current_start),
            currentPeriodEnd: ts(subEntity.current_end),
          },
        });
        await audit({ action: 'billing.subscription_active', workspaceId: sub.workspaceId, metadata: { plan: plan.key, event: ev.event } });
        break;
      }
      case 'subscription.pending':
        if (sub) await db.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
        break;
      case 'subscription.halted':
        if (sub) await db.subscription.update({ where: { id: sub.id }, data: { status: 'HALTED' } });
        break;
      case 'subscription.cancelled':
      case 'subscription.completed':
        if (sub) {
          await db.subscription.update({
            where: { id: sub.id },
            data: { planId: await defaultPlanId(), pendingPlanId: null, provider: 'NONE', providerSubscriptionId: null, status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: null },
          });
          await audit({ action: 'billing.subscription_ended', workspaceId: sub.workspaceId, metadata: { event: ev.event } });
        }
        break;
    }

    const pay = ev.payload.payment?.entity;
    if (pay && sub) {
      await db.payment.upsert({
        where: { providerPaymentId: pay.id },
        create: { workspaceId: sub.workspaceId, subscriptionId: sub.id, providerPaymentId: pay.id, amount: pay.amount, currency: pay.currency, status: pay.status, method: pay.method ?? null },
        update: { status: pay.status },
      });
    }
    const inv = ev.payload.invoice?.entity;
    if (inv && sub) {
      await db.invoice.upsert({
        where: { providerInvoiceId: inv.id },
        create: {
          workspaceId: sub.workspaceId,
          subscriptionId: sub.id,
          providerInvoiceId: inv.id,
          amount: inv.amount,
          currency: inv.currency,
          status: inv.status,
          url: inv.short_url ?? null,
          issuedAt: ts(inv.issued_at) ?? new Date(),
          paidAt: ts(inv.paid_at),
        },
        update: { status: inv.status, paidAt: ts(inv.paid_at), url: inv.short_url ?? undefined },
      });
    }

    await db.webhookEvent.update({ where: { id: record.id }, data: { processedAt: new Date(), error: null } });
    return { duplicate: false };
  } catch (err) {
    await db.webhookEvent.update({ where: { id: record.id }, data: { error: (err as Error).message } });
    throw err;
  }
}
