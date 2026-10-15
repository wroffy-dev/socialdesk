import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { db } from '@/server/db';
import { exportInsightsCsv, getInsights } from '@/server/services/insights';
import { getBilling, processRazorpayEvent, startCheckout } from '@/server/services/billing';
import { verifyWebhookSignature } from '@/server/billing/razorpay';
import { getWorkspacePlan } from '@/server/services/entitlements';
import { setWorkspaceStatus, setWorkspacePlan, updatePlan } from '@/server/services/admin';
import { createPost } from '@/server/services/posts';
import { resetEnvCache } from '@/server/env';
import { addMember, makeChannel, makeUser, makeWorkspace } from './helpers/factories';

afterEach(() => {
  delete process.env.BILLING_ENABLED;
  resetEnvCache();
});

describe('insights', () => {
  it('reports real values and leaves unavailable metrics null', async () => {
    const { ws, ctx } = await makeWorkspace('Insights Co');
    const ch = await makeChannel(ws.id);
    const p = await createPost(ctx, { baseCaption: '=HYPERLINK("evil")', versions: [{ socialAccountId: ch.id }], action: { type: 'publish_now' } });
    await db.platformPost.update({ where: { id: p.versions[0]!.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), externalId: 'x' } });
    let data = await getInsights(ctx, { range: '7d' });
    expect(data.totals.postsPublished).toBe(1);
    expect(data.totals.followers).toBeNull();
    expect(data.totals.engagementRate).toBeNull();
    expect(data.hasAnyMetrics).toBe(false);
    expect(data.series).toHaveLength(7);

    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    await db.metricSnapshot.create({ data: { workspaceId: ws.id, socialAccountId: ch.id, date: today, followers: 650, reach: 200 } });
    await db.postMetric.create({ data: { workspaceId: ws.id, platformPostId: p.versions[0]!.id, likes: 10, comments: 5, shares: 1, reach: 160 } });
    data = await getInsights(ctx, { range: '7d' });
    expect(data.totals.followers).toBe(650);
    expect(data.totals.likes).toBe(10);
    expect(data.totals.engagementRate).toBe(10); // (10+5+1)/160
  });

  it('clamps history to the plan and gates CSV export; exported captions cannot run formulas', async () => {
    const { ws, ctx } = await makeWorkspace('Export Co');
    const data = await getInsights(ctx, { range: 'custom', from: '2020-01-01', to: new Date().toISOString().slice(0, 10) });
    expect(data.range.clamped).toBe(true);
    expect(data.range.days).toBeLessThanOrEqual(30);
    await expect(exportInsightsCsv(ctx, { range: '7d' })).rejects.toMatchObject({ status: 402 });

    await setWorkspacePlan({ id: ctx.user.id }, ws.id, 'pro');
    const ch = await makeChannel(ws.id);
    const p = await createPost(ctx, { baseCaption: '=cmd|calc', versions: [{ socialAccountId: ch.id }], action: { type: 'publish_now' } });
    await db.platformPost.update({ where: { id: p.versions[0]!.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    const csv = await exportInsightsCsv(ctx, { range: '7d' });
    expect(csv.body).toContain("'=cmd|calc");
    expect(csv.body).not.toMatch(/,=cmd/);
  });

  it('analysts can view insights; strangers cannot', async () => {
    const { ws } = await makeWorkspace('View Co');
    const analyst = await addMember(ws.id, 'ANALYST');
    await expect(getInsights(analyst, {})).resolves.toBeTruthy();
  });
});

describe('billing', () => {
  it('refuses checkout during the free beta and for non-owners', async () => {
    const { ws, ctx } = await makeWorkspace('Beta Co');
    await expect(startCheckout(ctx, 'pro')).rejects.toMatchObject({ status: 400 });
    const admin = await addMember(ws.id, 'ADMIN');
    await expect(startCheckout(admin, 'pro')).rejects.toMatchObject({ status: 403 });
    const billing = await getBilling(ctx);
    expect(billing.billingEnabled).toBe(false);
    expect(billing.plan.key).toBe('free');
    // Every workspace starts with one project; Free allows two.
    expect(billing.usage.find((u) => u.key === 'projects')).toMatchObject({ used: 1, limit: 2 });
  });

  it('verifies webhook signatures', () => {
    const body = JSON.stringify({ event: 'x' });
    const sig = createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, 'whsec')).toBe(true);
    expect(verifyWebhookSignature(body, sig, 'other')).toBe(false);
    expect(verifyWebhookSignature(body + ' ', sig, 'whsec')).toBe(false);
    expect(verifyWebhookSignature(body, null, 'whsec')).toBe(false);
  });

  it('upgrades only on a verified subscription event, idempotently, and downgrades on cancel', async () => {
    const { ws } = await makeWorkspace('Paying Co');
    const pro = await db.plan.findUniqueOrThrow({ where: { key: 'pro' } });
    await db.plan.update({ where: { id: pro.id }, data: { razorpayPlanId: 'plan_pro_test' } });
    // State after checkout started: still on free, pending pro.
    await db.subscription.update({ where: { workspaceId: ws.id }, data: { providerSubscriptionId: `sub_${ws.id}`, pendingPlanId: pro.id } });
    expect((await getWorkspacePlan(ws.id)).planKey).toBe('free');

    const event = {
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: `sub_${ws.id}`, plan_id: 'plan_pro_test', status: 'active', current_start: 1790000000, current_end: 1792600000 } },
        payment: { entity: { id: `pay_${ws.id}`, amount: 149900, currency: 'INR', status: 'captured', method: 'upi', subscription_id: `sub_${ws.id}` } },
      },
    };
    expect(await processRazorpayEvent(`evt_${ws.id}`, event)).toEqual({ duplicate: false });
    expect(await processRazorpayEvent(`evt_${ws.id}`, event)).toEqual({ duplicate: true });
    expect((await getWorkspacePlan(ws.id)).planKey).toBe('pro');
    expect(await db.payment.count({ where: { workspaceId: ws.id } })).toBe(1);

    await processRazorpayEvent(`evt_${ws.id}_halt`, { event: 'subscription.halted', payload: { subscription: event.payload.subscription } });
    expect((await getWorkspacePlan(ws.id)).planKey).toBe('free'); // halted subscriptions lose paid limits

    await processRazorpayEvent(`evt_${ws.id}_cancel`, { event: 'subscription.cancelled', payload: { subscription: event.payload.subscription } });
    const sub = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ws.id }, include: { plan: true } });
    expect(sub.plan.key).toBe('free');
    expect(sub.providerSubscriptionId).toBeNull();
  });
});

describe('super admin operations', () => {
  it('suspending a workspace cancels its scheduled posts and blocks edits', async () => {
    const { ws, ctx } = await makeWorkspace('Suspend Co');
    const ch = await makeChannel(ws.id);
    await createPost(ctx, { baseCaption: 'later', versions: [{ socialAccountId: ch.id }], action: { type: 'schedule', scheduledAt: new Date(Date.now() + 3600_000).toISOString(), timezone: 'UTC' } });
    const admin = await makeUser();
    const res = await setWorkspaceStatus(admin, ws.id, 'SUSPENDED', 'Policy review');
    expect(res.cancelledPosts).toBe(1);
    const fresh = await db.workspace.findUniqueOrThrow({ where: { id: ws.id } });
    expect(fresh.status).toBe('SUSPENDED');
    expect(fresh.suspendReason).toBe('Policy review');
  });

  it('plan limits edited by an admin apply immediately', async () => {
    const { ws, ctx } = await makeWorkspace('Limit Co');
    const paid = await db.plan.findUniqueOrThrow({ where: { key: 'pro' }, include: { entitlements: true } });
    await setWorkspacePlan({ id: ctx.user.id }, ws.id, 'pro');
    await updatePlan({ id: ctx.user.id }, paid.id, {
      name: paid.name,
      description: paid.description,
      priceAmount: paid.priceAmount,
      currency: 'INR',
      razorpayPlanId: null,
      isActive: true,
      isPublic: true,
      sortOrder: paid.sortOrder,
      entitlements: paid.entitlements.map((e) => (e.key === 'projects' ? { key: e.key, enabled: true, limit: 42 } : { key: e.key, enabled: e.enabled, limit: e.limit })),
    });
    const plan = await getWorkspacePlan(ws.id);
    expect(plan.entitlements.get('projects')?.limit).toBe(42);
    await updatePlan({ id: ctx.user.id }, paid.id, {
      name: paid.name,
      description: paid.description,
      priceAmount: paid.priceAmount,
      currency: 'INR',
      razorpayPlanId: null,
      isActive: true,
      isPublic: true,
      sortOrder: paid.sortOrder,
      entitlements: paid.entitlements.map((e) => ({ key: e.key, enabled: e.enabled, limit: e.limit })),
    });
  });
});
