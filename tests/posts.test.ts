import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import {
  cancelPost,
  createPost,
  deletePost,
  duplicatePost,
  getPost,
  listCalendar,
  listPosts,
  reschedulePost,
  retryVersion,
  updatePost,
} from '@/server/services/posts';
import { getQueue, moveInQueue, setQueuePaused } from '@/server/services/queue';
import { deriveStatus } from '@/server/publishing/status';
import { addMember, makeChannel, makeWorkspace } from './helpers/factories';
import { uploadImage } from './helpers/media';

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe('post composer and scheduling', () => {
  it('saves platform-specific versions independently', async () => {
    const { ws, ctx } = await makeWorkspace('Versions');
    const fb = await makeChannel(ws.id, 'FACEBOOK');
    const ig = await makeChannel(ws.id, 'INSTAGRAM');
    const img = await uploadImage(ctx);
    const post = await createPost(ctx, {
      baseCaption: 'Shared caption',
      versions: [
        { socialAccountId: fb.id },
        { socialAccountId: ig.id, customized: true, caption: 'IG only #tag', mediaIds: [img.id] },
      ],
    });
    expect(post.status).toBe('DRAFT');
    const fbV = post.versions.find((v) => v.platform === 'FACEBOOK')!;
    const igV = post.versions.find((v) => v.platform === 'INSTAGRAM')!;
    expect(fbV).toMatchObject({ customized: false, format: 'TEXT' });
    expect(igV).toMatchObject({ customized: true, caption: 'IG only #tag', format: 'FEED' });
    expect(igV.media.map((m) => m.id)).toEqual([img.id]);
  });

  it('validates each platform before scheduling', async () => {
    const { ws, ctx } = await makeWorkspace('Validation');
    const ig = await makeChannel(ws.id, 'INSTAGRAM');
    const fb = await makeChannel(ws.id, 'FACEBOOK');
    // Instagram requires media; Facebook does not.
    const err = await createPost(ctx, {
      baseCaption: 'Text only',
      versions: [{ socialAccountId: ig.id }, { socialAccountId: fb.id }],
      action: { type: 'schedule', scheduledAt: inHours(2), timezone: 'Asia/Kolkata' },
    }).catch((e) => e);
    expect(err.status).toBe(422);
    expect(err.details.versions).toHaveLength(1);
    expect(err.details.versions[0].platform).toBe('INSTAGRAM');
    // Nothing was persisted by the failed transaction.
    expect(await db.socialPost.count({ where: { workspaceId: ws.id } })).toBe(0);

    const ok = await createPost(ctx, {
      baseCaption: 'Text only',
      versions: [{ socialAccountId: fb.id }],
      action: { type: 'schedule', scheduledAt: inHours(2), timezone: 'Asia/Kolkata' },
    });
    expect(ok.status).toBe('SCHEDULED');
    expect(ok.versions[0]!.status).toBe('SCHEDULED');
    expect(ok.timezone).toBe('Asia/Kolkata');
  });

  it('rejects past times and unverified users', async () => {
    const { ws, ctx } = await makeWorkspace('Times');
    const fb = await makeChannel(ws.id);
    await expect(
      createPost(ctx, { baseCaption: 'x', versions: [{ socialAccountId: fb.id }], action: { type: 'schedule', scheduledAt: inHours(-1), timezone: 'UTC' } }),
    ).rejects.toMatchObject({ status: 400 });
    const unverified = { ...ctx, user: { ...ctx.user, emailVerified: null } };
    await expect(
      createPost(unverified, { baseCaption: 'x', versions: [{ socialAccountId: fb.id }], action: { type: 'publish_now' } }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('reschedules, unschedules, cancels, duplicates and deletes', async () => {
    const { ws, ctx } = await makeWorkspace('Lifecycle');
    const fb = await makeChannel(ws.id);
    const p = await createPost(ctx, {
      baseCaption: 'Move me',
      versions: [{ socialAccountId: fb.id }],
      action: { type: 'schedule', scheduledAt: inHours(3), timezone: 'UTC' },
    });
    const moved = await reschedulePost(ctx, p.id, inHours(5));
    expect(new Date(moved.scheduledAt!).getTime()).toBeGreaterThan(new Date(p.scheduledAt!).getTime());
    expect(moved.versions[0]!.scheduledAt).toBe(moved.scheduledAt);

    await expect(deletePost(ctx, p.id)).rejects.toMatchObject({ status: 409 });
    const draft = await cancelPost(ctx, p.id, true);
    expect(draft.status).toBe('DRAFT');
    expect(draft.scheduledAt).toBeNull();

    const copy = await duplicatePost(ctx, p.id);
    expect(copy.id).not.toBe(p.id);
    expect(copy.status).toBe('DRAFT');
    expect(copy.baseCaption).toBe('Move me');

    await deletePost(ctx, copy.id);
    await expect(getPost(ctx, copy.id)).rejects.toMatchObject({ status: 404 });
  });

  it('does not allow editing a post that is publishing', async () => {
    const { ws, ctx } = await makeWorkspace('Locked');
    const fb = await makeChannel(ws.id);
    const p = await createPost(ctx, { baseCaption: 'x', versions: [{ socialAccountId: fb.id }], action: { type: 'publish_now' } });
    await db.platformPost.updateMany({ where: { postId: p.id }, data: { status: 'PUBLISHING' } });
    await db.socialPost.update({ where: { id: p.id }, data: { status: 'PUBLISHING' } });
    await expect(updatePost(ctx, p.id, { baseCaption: 'changed', versions: [{ socialAccountId: fb.id }] })).rejects.toMatchObject({ status: 409 });
    await expect(reschedulePost(ctx, p.id, inHours(4))).rejects.toMatchObject({ status: 409 });
  });

  it('retries failed versions and guards ambiguous ones', async () => {
    const { ws, ctx } = await makeWorkspace('Retry');
    const fb = await makeChannel(ws.id);
    const p = await createPost(ctx, { baseCaption: 'x', versions: [{ socialAccountId: fb.id }], action: { type: 'publish_now' } });
    const vId = p.versions[0]!.id;
    await db.platformPost.update({ where: { id: vId }, data: { status: 'NEEDS_VERIFICATION' } });
    await expect(retryVersion(ctx, vId)).rejects.toMatchObject({ status: 409 });
    const retried = await retryVersion(ctx, vId, { force: true });
    expect(retried.versions[0]!.status).toBe('SCHEDULED');
  });

  it('enforces roles', async () => {
    const { ws } = await makeWorkspace('Roles');
    const fb = await makeChannel(ws.id);
    const analyst = await addMember(ws.id, 'ANALYST');
    await expect(createPost(analyst, { baseCaption: 'x', versions: [{ socialAccountId: fb.id }] })).rejects.toMatchObject({ status: 403 });
    const publisher = await addMember(ws.id, 'PUBLISHER');
    await expect(
      createPost(publisher, { baseCaption: 'x', versions: [{ socialAccountId: fb.id }], action: { type: 'schedule', scheduledAt: inHours(1), timezone: 'UTC' } }),
    ).resolves.toMatchObject({ status: 'SCHEDULED' });
  });

  it('enforces the monthly post quota', async () => {
    const { ws, ctx } = await makeWorkspace('Quota');
    const fb = await makeChannel(ws.id);
    const free = await db.plan.findUniqueOrThrow({ where: { key: 'free' }, include: { entitlements: true } });
    const limit = free.entitlements.find((e) => e.key === 'posts_per_month')!.limit!;
    const at = new Date();
    at.setUTCDate(Math.min(at.getUTCDate() + 1, 28));
    const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    await db.usageRecord.create({ data: { workspaceId: ws.id, metric: 'posts_published', periodStart: month, count: limit } });
    await expect(
      createPost(ctx, { baseCaption: 'x', versions: [{ socialAccountId: fb.id }], action: { type: 'publish_now' } }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it('isolates posts between workspaces', async () => {
    const a = await makeWorkspace('Posts A');
    const b = await makeWorkspace('Posts B');
    const bCh = await makeChannel(b.ws.id);
    const aCh = await makeChannel(a.ws.id);
    const bPost = await createPost(b.ctx, { baseCaption: 'secret', versions: [{ socialAccountId: bCh.id }], action: { type: 'publish_now' } });

    await expect(getPost(a.ctx, bPost.id)).rejects.toMatchObject({ status: 404 });
    await expect(updatePost(a.ctx, bPost.id, { baseCaption: 'pwned', versions: [] })).rejects.toMatchObject({ status: 404 });
    await expect(deletePost(a.ctx, bPost.id)).rejects.toMatchObject({ status: 404 });
    await expect(cancelPost(a.ctx, bPost.id)).rejects.toMatchObject({ status: 404 });
    await expect(reschedulePost(a.ctx, bPost.id, inHours(9))).rejects.toMatchObject({ status: 404 });
    await expect(duplicatePost(a.ctx, bPost.id)).rejects.toMatchObject({ status: 404 });
    await expect(retryVersion(a.ctx, bPost.versions[0]!.id)).rejects.toMatchObject({ status: 404 });
    // Publishing to another workspace's channel is refused.
    await expect(createPost(a.ctx, { baseCaption: 'x', versions: [{ socialAccountId: bCh.id }] })).rejects.toMatchObject({ status: 404 });

    const list = await listPosts(a.ctx, { tab: 'all' });
    expect(list.items.some((i) => i.id === bPost.id)).toBe(false);
    const cal = await listCalendar(a.ctx, { from: inHours(-24), to: inHours(24) });
    expect(cal.items.some((i) => i.id === bPost.id)).toBe(false);
    expect(aCh.workspaceId).toBe(a.ws.id);
    expect((await getPost(b.ctx, bPost.id)).baseCaption).toBe('secret');
  });

  it('lists posts by tab with counts and search', async () => {
    const { ws, ctx } = await makeWorkspace('Lists');
    const fb = await makeChannel(ws.id);
    await createPost(ctx, { baseCaption: 'Draft about pizza', versions: [{ socialAccountId: fb.id }] });
    await createPost(ctx, { baseCaption: 'Scheduled about tea', versions: [{ socialAccountId: fb.id }], action: { type: 'schedule', scheduledAt: inHours(6), timezone: 'UTC' } });
    const drafts = await listPosts(ctx, { tab: 'drafts' });
    expect(drafts.items.map((i) => i.caption)).toEqual(['Draft about pizza']);
    expect(drafts.tabCounts).toMatchObject({ all: 2, drafts: 1, scheduled: 1 });
    expect((await listPosts(ctx, { tab: 'all', q: 'tea' })).items).toHaveLength(1);
  });
});

describe('queue', () => {
  it('assigns queued posts to free slots in order and supports reordering and pause', async () => {
    const { ws, ctx } = await makeWorkspace('Queue Co');
    const fb = await makeChannel(ws.id);
    const p1 = await createPost(ctx, { baseCaption: 'first', versions: [{ socialAccountId: fb.id }], action: { type: 'queue' } });
    const p2 = await createPost(ctx, { baseCaption: 'second', versions: [{ socialAccountId: fb.id }], action: { type: 'queue' } });
    expect(p1.publishMode).toBe('QUEUE');
    expect(new Date(p2.scheduledAt!).getTime()).toBeGreaterThan(new Date(p1.scheduledAt!).getTime());

    let q = await getQueue(ctx);
    expect(q.queued.map((x) => x.caption)).toEqual(['first', 'second']);
    q = await moveInQueue(ctx, p2.id, 'up');
    expect(q.queued.map((x) => x.caption)).toEqual(['second', 'first']);

    q = await setQueuePaused(ctx, true);
    expect(q.paused).toBe(true);
    // Simulate a slot passing during the pause.
    await db.socialPost.update({ where: { id: p1.id }, data: { scheduledAt: new Date(Date.now() - 60_000) } });
    await db.platformPost.updateMany({ where: { postId: p1.id }, data: { scheduledAt: new Date(Date.now() - 60_000) } });
    q = await setQueuePaused(ctx, false);
    const resumed = await getPost(ctx, p1.id);
    expect(new Date(resumed.scheduledAt!).getTime()).toBeGreaterThan(Date.now());
    expect(resumed.versions[0]!.scheduledAt).toBe(resumed.scheduledAt);
  });
});

describe('status derivation', () => {
  it('summarises version statuses', () => {
    expect(deriveStatus(['PUBLISHED', 'PUBLISHED'], 'PUBLISHING')).toBe('PUBLISHED');
    expect(deriveStatus(['PUBLISHED', 'FAILED'], 'PUBLISHING')).toBe('PARTIALLY_PUBLISHED');
    expect(deriveStatus(['FAILED', 'NEEDS_VERIFICATION'], 'PUBLISHING')).toBe('FAILED');
    expect(deriveStatus(['PUBLISHING', 'SCHEDULED'], 'SCHEDULED')).toBe('PUBLISHING');
    expect(deriveStatus(['CANCELLED'], 'SCHEDULED')).toBe('CANCELLED');
  });
});
