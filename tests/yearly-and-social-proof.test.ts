import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { listPublicPlans, processRazorpayEvent } from '@/server/services/billing';
import { getWorkspacePlan } from '@/server/services/entitlements';
import { deleteTestimonial, publishedSocialProof, saveCustomerLogo, saveTestimonial } from '@/server/services/social-proof';
import { bestYearlySavings, yearlySavingsPct } from '@/lib/pricing';
import { makeWorkspace } from './helpers/factories';

describe('yearly billing', () => {
  it('computes savings', () => {
    expect(yearlySavingsPct(49900, 499000)).toBe(17);
    expect(yearlySavingsPct(49900, null)).toBe(0);
    expect(yearlySavingsPct(0, 1000)).toBe(0);
    expect(yearlySavingsPct(1000, 20000)).toBe(0); // dearer than monthly: never a negative "saving"
    expect(bestYearlySavings([{ priceAmount: 1000, yearlyPriceAmount: 9000 }, { priceAmount: 1000, yearlyPriceAmount: 10000 }])).toBe(25);
  });

  it('lists yearly prices, purchasable only with a Razorpay yearly plan', async () => {
    const pro = await db.plan.findUniqueOrThrow({ where: { key: 'pro' } });
    await db.plan.update({ where: { id: pro.id }, data: { yearlyPriceAmount: 499000, razorpayYearlyPlanId: null } });
    let listed = (await listPublicPlans()).find((p) => p.key === 'pro')!;
    expect(listed).toMatchObject({ yearlyPriceAmount: 499000, purchasableYearly: false });
    await db.plan.update({ where: { id: pro.id }, data: { razorpayYearlyPlanId: 'plan_pro_yearly_test' } });
    listed = (await listPublicPlans()).find((p) => p.key === 'pro')!;
    expect(listed.purchasableYearly).toBe(true);
    expect((await listPublicPlans()).find((p) => p.key === 'free')!.yearlyPriceAmount).toBeNull();
  });

  it('records a yearly subscription from the Razorpay plan id in the webhook', async () => {
    const { ws } = await makeWorkspace('Yearly Co');
    const business = await db.plan.findUniqueOrThrow({ where: { key: 'business' } });
    await db.plan.update({ where: { id: business.id }, data: { razorpayPlanId: 'plan_biz_m', razorpayYearlyPlanId: 'plan_biz_y', yearlyPriceAmount: 1499000 } });
    await db.subscription.update({ where: { workspaceId: ws.id }, data: { providerSubscriptionId: `sub_y_${ws.id}` } });

    const sub = { entity: { id: `sub_y_${ws.id}`, plan_id: 'plan_biz_y', status: 'active', current_start: 1790000000, current_end: 1821536000 } };
    await processRazorpayEvent(`evt_y_${ws.id}`, { event: 'subscription.activated', payload: { subscription: sub } });
    const row = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ws.id } });
    expect(row).toMatchObject({ interval: 'year', provider: 'RAZORPAY' });
    expect((await getWorkspacePlan(ws.id)).planKey).toBe('business');

    await processRazorpayEvent(`evt_y_${ws.id}_end`, { event: 'subscription.completed', payload: { subscription: sub } });
    expect(await db.subscription.findUniqueOrThrow({ where: { workspaceId: ws.id } })).toMatchObject({ interval: 'month', provider: 'NONE' });
  });
});

describe('testimonials and logos', () => {
  it('shows only published entries and accepts only https images', async () => {
    const { ctx } = await makeWorkspace('Proof Admin Co');
    const admin = { id: ctx.user.id };
    const base = { authorRole: 'Founder', company: 'Masala Box', avatarUrl: '', sortOrder: 0 };

    await expect(saveTestimonial(admin, null, { ...base, quote: 'Short', authorName: 'A', isPublished: true })).rejects.toBeTruthy();
    await expect(saveTestimonial(admin, null, { ...base, quote: 'Saves us hours every week.', authorName: 'A', avatarUrl: 'javascript:alert(1)', isPublished: true })).rejects.toBeTruthy();
    await expect(saveTestimonial(admin, null, { ...base, quote: 'Saves us hours every week.', authorName: 'A', avatarUrl: 'http://example.com/a.png', isPublished: true })).rejects.toBeTruthy();

    const draft = await saveTestimonial(admin, null, { ...base, quote: 'Draft quote, not approved yet.', authorName: 'Draft Person', isPublished: false });
    const live = await saveTestimonial(admin, null, { ...base, quote: 'Saves us hours every week.', authorName: 'Live Person', avatarUrl: 'https://example.com/a.png', isPublished: true });
    await saveCustomerLogo(admin, null, { name: 'Hidden Brand', imageUrl: '', websiteUrl: '', isPublished: false, sortOrder: 0 });
    await saveCustomerLogo(admin, null, { name: 'Shown Brand', imageUrl: 'https://example.com/logo.svg', websiteUrl: 'https://example.com', isPublished: true, sortOrder: 0 });

    const proof = await publishedSocialProof();
    expect(proof.testimonials.map((t) => t.authorName)).toContain('Live Person');
    expect(proof.testimonials.map((t) => t.authorName)).not.toContain('Draft Person');
    expect(proof.testimonials.find((t) => t.id === live.id)).toMatchObject({ avatarUrl: 'https://example.com/a.png', company: 'Masala Box' });
    expect(proof.logos.map((l) => l.name)).toContain('Shown Brand');
    expect(proof.logos.map((l) => l.name)).not.toContain('Hidden Brand');

    await saveTestimonial(admin, draft.id, { ...base, quote: 'Draft quote, now approved.', authorName: 'Draft Person', isPublished: true });
    expect((await publishedSocialProof()).testimonials.map((t) => t.authorName)).toContain('Draft Person');
    await deleteTestimonial(admin, draft.id);
    expect((await publishedSocialProof()).testimonials.map((t) => t.authorName)).not.toContain('Draft Person');
    await expect(deleteTestimonial(admin, draft.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.auditLog.count({ where: { action: { startsWith: 'admin.testimonial_' }, actorId: admin.id } })).toBe(4);
  });
});
