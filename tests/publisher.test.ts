import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { processPublish, retryDelayMs } from '@/server/publishing/publisher';
import { reconcile } from '@/server/publishing/reconciler';
import { createPost } from '@/server/services/posts';
import { deleteMedia } from '@/server/services/media';
import { setQueuePaused } from '@/server/services/queue';
import { setAdaptersForTesting } from '@/server/adapters/registry';
import { FacebookAdapter } from '@/server/adapters/meta/facebook';
import { InstagramAdapter } from '@/server/adapters/meta/instagram';
import { GraphClient } from '@/server/adapters/meta/graph';
import { getUsage } from '@/server/services/entitlements';
import { makeChannel, makeWorkspace } from './helpers/factories';
import { uploadImage } from './helpers/media';
import { fakeGraph } from './helpers/fake-graph';

const W = { workerId: 'test-worker' };

async function duePost(caption: string, opts: { platform?: 'FACEBOOK' | 'INSTAGRAM'; withImage?: boolean } = {}) {
  const { ws, ctx } = await makeWorkspace('Pub');
  const ch = await makeChannel(ws.id, opts.platform ?? 'FACEBOOK');
  const img = opts.withImage ? await uploadImage(ctx) : null;
  const post = await createPost(ctx, { baseCaption: caption, baseMediaIds: img ? [img.id] : [], versions: [{ socialAccountId: ch.id }], action: { type: 'publish_now' } });
  return { ws, ctx, ch, post, versionId: post.versions[0]!.id, img };
}

const version = (id: string) => db.platformPost.findUniqueOrThrow({ where: { id }, include: { attempts: true, post: true } });

afterEach(() => setAdaptersForTesting(undefined));

describe('publisher', () => {
  it('publishes a due version and records the attempt and usage', async () => {
    const { ws, versionId } = await duePost('Hello from the worker');
    expect(await processPublish(versionId, W)).toBe('published');
    const v = await version(versionId);
    expect(v.status).toBe('PUBLISHED');
    expect(v.externalId).toMatch(/^mock_facebook_/);
    expect(v.publishedAt).not.toBeNull();
    expect(v.attempts).toHaveLength(1);
    expect(v.attempts[0]!.status).toBe('SUCCEEDED');
    expect(v.post.status).toBe('PUBLISHED');
    expect(await getUsage(ws.id, 'posts_published')).toBe(1);
  });

  it('only one of several concurrent workers publishes a version', async () => {
    const { versionId } = await duePost('Race condition test');
    const results = await Promise.all([processPublish(versionId, { workerId: 'a' }), processPublish(versionId, { workerId: 'b' }), processPublish(versionId, { workerId: 'c' })]);
    expect(results.filter((r) => r === 'published')).toHaveLength(1);
    expect(results.filter((r) => r === 'skipped_not_due')).toHaveLength(2);
    const v = await version(versionId);
    expect(v.attempts).toHaveLength(1);
    // A late duplicate job for an already-published version is ignored.
    expect(await processPublish(versionId, W)).toBe('skipped_not_due');
  });

  it('ignores jobs for versions that are not due yet (rescheduled later)', async () => {
    const { ws, ctx } = await makeWorkspace('Later');
    const ch = await makeChannel(ws.id);
    const post = await createPost(ctx, {
      baseCaption: 'future',
      versions: [{ socialAccountId: ch.id }],
      action: { type: 'schedule', scheduledAt: new Date(Date.now() + 3600_000).toISOString(), timezone: 'UTC' },
    });
    expect(await processPublish(post.versions[0]!.id, W)).toBe('skipped_not_due');
    expect((await version(post.versions[0]!.id)).status).toBe('SCHEDULED');
  });

  it('retries transient failures with backoff, then succeeds', async () => {
    const { versionId } = await duePost('Sometimes fails #mock-flaky');
    expect(await processPublish(versionId, W)).toBe('retry_scheduled');
    let v = await version(versionId);
    expect(v.status).toBe('SCHEDULED');
    expect(v.nextRetryAt!.getTime()).toBeGreaterThan(Date.now() + 25_000);
    expect(v.lastError).toContain('temporarily unavailable');
    expect(v.post.status).toBe('SCHEDULED');
    // Not due yet: a stray job does nothing.
    expect(await processPublish(versionId, W)).toBe('skipped_not_due');
    await db.platformPost.update({ where: { id: versionId }, data: { scheduledAt: new Date() } });
    expect(await processPublish(versionId, W)).toBe('published');
    v = await version(versionId);
    expect(v.attempts.map((a) => a.status).sort()).toEqual(['FAILED', 'SUCCEEDED']);
  });

  it('gives up after the maximum number of attempts', async () => {
    const { versionId } = await duePost('Always flaky #mock-flaky');
    await db.platformPost.update({ where: { id: versionId }, data: { attemptCount: 3 } });
    expect(await processPublish(versionId, W)).toBe('failed');
    const v = await version(versionId);
    expect(v.status).toBe('FAILED');
    expect(v.lastError).toContain('gave up after 4 attempts');
  });

  it('fails permanently without retrying', async () => {
    const { versionId } = await duePost('Rejected #mock-fail');
    expect(await processPublish(versionId, W)).toBe('failed');
    const v = await version(versionId);
    expect(v.status).toBe('FAILED');
    expect(v.post.status).toBe('FAILED');
    expect(v.attempts[0]!.retryable).toBe(false);
  });

  it('marks the channel for reconnection on auth errors', async () => {
    const { ch, versionId } = await duePost('Token revoked #mock-authfail');
    expect(await processPublish(versionId, W)).toBe('failed');
    expect((await db.socialAccount.findUniqueOrThrow({ where: { id: ch.id } })).status).toBe('NEEDS_REAUTH');
  });

  it('never retries an ambiguous outcome blindly; the reconciler verifies first', async () => {
    const { versionId } = await duePost('Timeout #mock-timeout');
    expect(await processPublish(versionId, W)).toBe('needs_verification');
    let v = await version(versionId);
    expect(v.status).toBe('NEEDS_VERIFICATION');
    expect(v.attempts[0]!.status).toBe('AMBIGUOUS');
    // The mock platform confirms nothing was published, so a retry is scheduled.
    await reconcile();
    v = await version(versionId);
    expect(v.status).toBe('SCHEDULED');
  });

  it('holds queued posts while the queue is paused', async () => {
    const { ws, ctx } = await makeWorkspace('Paused');
    const ch = await makeChannel(ws.id);
    const post = await createPost(ctx, { baseCaption: 'queued', versions: [{ socialAccountId: ch.id }], action: { type: 'queue' } });
    await setQueuePaused(ctx, true);
    await db.platformPost.updateMany({ where: { postId: post.id }, data: { scheduledAt: new Date() } });
    expect(await processPublish(post.versions[0]!.id, W)).toBe('skipped_paused');
    expect((await version(post.versions[0]!.id)).status).toBe('SCHEDULED');
  });

  it('does not publish for suspended workspaces', async () => {
    const { ws, versionId } = await duePost('Suspended');
    await db.workspace.update({ where: { id: ws.id }, data: { status: 'SUSPENDED' } });
    expect(await processPublish(versionId, W)).toBe('failed');
    expect((await version(versionId)).lastErrorCode).toBe('workspace_suspended');
  });

  it('re-validates at publish time (deleted media fails cleanly)', async () => {
    const { ctx, versionId, img } = await duePost('With image', { platform: 'INSTAGRAM', withImage: true });
    await db.mediaAsset.update({ where: { id: img!.id }, data: { deletedAt: new Date() } });
    expect(await processPublish(versionId, W)).toBe('failed');
    expect((await version(versionId)).lastError).toMatch(/deleted|needs at least one/i);
    await expect(deleteMedia(ctx, img!.id)).rejects.toMatchObject({ status: 404 });
  });

  it('recovers versions left in PUBLISHING by a crashed worker', async () => {
    const a = await duePost('crash before sending');
    const b = await duePost('crash after sending');
    const old = new Date(Date.now() - 20 * 60_000);
    for (const [x, meta] of [
      [a, null],
      [b, { finalCallAt: old.toISOString() }],
    ] as const) {
      await db.platformPost.update({ where: { id: x.versionId }, data: { status: 'PUBLISHING', lockedAt: old, attemptCount: 1 } });
      await db.publishingAttempt.create({ data: { workspaceId: x.ws.id, platformPostId: x.versionId, attemptNumber: 1, responseMeta: meta ?? undefined } });
    }
    const stats = await reconcile();
    expect(stats.recovered).toBeGreaterThanOrEqual(2);
    expect((await version(a.versionId)).status).toBe('SCHEDULED');
    // Mock verification finds the post wasn't published, so it's retried rather than duplicated.
    expect(['NEEDS_VERIFICATION', 'SCHEDULED']).toContain((await version(b.versionId)).status);
  });

  it('computes backoff', () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(15 * 60_000);
    expect(retryDelayMs(1, 900)).toBe(900_000);
  });
});

describe('publisher with the real Meta adapters (fake Graph API)', () => {
  it('publishes to a Facebook Page through the Graph API', async () => {
    const { fetchImpl, calls } = fakeGraph([['POST', /\/feed$/, () => ({ body: { id: 'page_123' } })]]);
    const graph = new GraphClient({ version: 'v23.0', fetchImpl });
    setAdaptersForTesting({ FACEBOOK: new FacebookAdapter(graph), INSTAGRAM: new InstagramAdapter(graph) });
    const { versionId, ch } = await duePost('Real adapter path');
    await db.socialAccount.update({ where: { id: ch.id }, data: { mode: 'DEVELOPMENT', scopes: ['pages_manage_posts'] } });
    expect(await processPublish(versionId, W)).toBe('published');
    const v = await version(versionId);
    expect(v).toMatchObject({ status: 'PUBLISHED', externalId: 'page_123', externalUrl: 'https://www.facebook.com/page_123' });
    expect(calls[0]!.params.get('message')).toBe('Real adapter path');
    expect(calls[0]!.params.get('access_token')).toBe('mock-token');
  });

  it('sends Instagram a signed, expiring media URL (JPEG) and publishes once', async () => {
    const { fetchImpl, calls } = fakeGraph([
      ['GET', /content_publishing_limit$/, () => ({ body: { data: [] } })],
      ['POST', /\/media$/, () => ({ body: { id: 'c1' } })],
      ['GET', /^c1$/, () => ({ body: { status_code: 'FINISHED' } })],
      ['POST', /\/media_publish$/, () => ({ body: { id: 'ig1' } })],
      ['GET', /^ig1$/, () => ({ body: { permalink: 'https://instagram.com/p/ig1' } })],
    ]);
    const graph = new GraphClient({ version: 'v23.0', fetchImpl });
    setAdaptersForTesting({ FACEBOOK: new FacebookAdapter(graph), INSTAGRAM: new InstagramAdapter(graph, { sleep: async () => {} }) });
    const { versionId, ch } = await duePost('Insta post', { platform: 'INSTAGRAM', withImage: true });
    await db.socialAccount.update({ where: { id: ch.id }, data: { mode: 'DEVELOPMENT', scopes: ['instagram_basic', 'instagram_content_publish'] } });
    expect(await processPublish(versionId, W)).toBe('published');
    const imageUrl = new URL(calls.find((c) => c.path.endsWith('/media'))!.params.get('image_url')!);
    expect(imageUrl.pathname).toMatch(/^\/api\/media\/public\//);
    expect(imageUrl.searchParams.get('sig')).toBeTruthy();
    expect(Number(imageUrl.searchParams.get('exp'))).toBeGreaterThan(Date.now() / 1000);
    expect(calls.filter((c) => c.path.endsWith('media_publish'))).toHaveLength(1);
    const v = await version(versionId);
    expect(v.externalUrl).toBe('https://instagram.com/p/ig1');
    expect(v.providerState).toMatchObject({ containerId: 'c1' });
  });
});
