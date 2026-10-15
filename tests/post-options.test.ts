import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { GraphClient } from '@/server/adapters/meta/graph';
import { FacebookAdapter } from '@/server/adapters/meta/facebook';
import { InstagramAdapter } from '@/server/adapters/meta/instagram';
import { MockAdapter } from '@/server/adapters/mock';
import { setAdaptersForTesting } from '@/server/adapters/registry';
import type { PublishInput } from '@/server/adapters/types';
import { processPublish } from '@/server/publishing/publisher';
import { retryFirstComment } from '@/server/publishing/first-comment';
import { createPost, getPost, schedulePost } from '@/server/services/posts';
import { DEFAULT_OPTIONS, normalizeOptions, versionOptionsSchema, type VersionOptions } from '@/lib/post-options';
import { errorsOnly, inferFormat, validateVersion, type MediaFacts } from '@/lib/platforms';
import { makeChannel, makeWorkspace } from './helpers/factories';
import { uploadImage } from './helpers/media';
import { fakeGraph } from './helpers/fake-graph';

const opt = (o: Partial<VersionOptions>): VersionOptions => ({ ...DEFAULT_OPTIONS, ...o });
const image = (id = 'i1', w = 1080, h = 1080): MediaFacts => ({ id, kind: 'IMAGE', mimeType: 'image/jpeg', sizeBytes: 100_000, width: w, height: h });
const video = (id = 'v1', durationSec = 20): MediaFacts => ({ id, kind: 'VIDEO', mimeType: 'video/mp4', sizeBytes: 5_000_000, width: 1080, height: 1920, durationSec });
const messages = (issues: { message: string }[]) => issues.map((i) => i.message).join(' | ');

describe('post options: rules', () => {
  it('normalises usernames and keeps only what each platform supports', () => {
    const parsed = versionOptionsSchema.parse({ collaborators: ['@Brand.Partner', 'brand.partner'], firstComment: 'Hi', igType: 'story' });
    const ig = normalizeOptions('INSTAGRAM', parsed);
    // A Story keeps none of the post-only options.
    expect(ig).toEqual({ ...DEFAULT_OPTIONS, igType: 'story' });
    expect(normalizeOptions('INSTAGRAM', { ...parsed, igType: 'post' }).collaborators).toEqual(['brand.partner']);
    const fb = normalizeOptions('FACEBOOK', parsed);
    expect(fb).toEqual({ ...DEFAULT_OPTIONS, firstComment: 'Hi' });
    expect(versionOptionsSchema.safeParse({ collaborators: ['not a name!'] }).success).toBe(false);
  });

  it('Stories: one item, no caption shown, no collaborators/tags/first comment', () => {
    expect(inferFormat('INSTAGRAM', { caption: '', media: [image()] }, opt({ igType: 'story' }))).toBe('STORY');
    expect(inferFormat('INSTAGRAM', { caption: '', media: [video()] })).toBe('REEL');

    const ok = validateVersion('INSTAGRAM', { caption: '', media: [image('a', 1080, 1920)] }, opt({ igType: 'story' }));
    expect(errorsOnly(ok)).toHaveLength(0);

    const bad = validateVersion('INSTAGRAM', { caption: 'hello', media: [image('a'), image('b')] }, opt({ igType: 'story', collaborators: ['x'], firstComment: 'c' }));
    const text = messages(bad);
    expect(text).toContain('exactly one image or video');
    expect(text).toContain('Captions are not shown on Stories');
    expect(text).toContain('Stories can’t have collaborators, the first comment');
    expect(errorsOnly(bad).map((i) => i.message)).toEqual(['An Instagram Story needs exactly one image or video.']);
    expect(messages(validateVersion('INSTAGRAM', { caption: '', media: [video('v', 90)] }, opt({ igType: 'story' })))).toContain('at most 60 seconds');
  });

  it('limits collaborators, tags and first comment length', () => {
    const issues = validateVersion(
      'INSTAGRAM',
      { caption: 'x', media: [image('a')] },
      opt({ collaborators: ['a', 'b', 'c', 'd'], firstComment: 'x'.repeat(2201), userTags: [{ username: 'gone', mediaId: 'deleted', x: 0.5, y: 0.5 }] }),
    );
    const text = messages(issues);
    expect(text).toContain('up to 3 collaborators');
    expect(text).toContain('The limit is 2,200');
    expect(issues.find((i) => i.message.includes('tags will be skipped'))?.severity).toBe('warning');
    expect(messages(validateVersion('FACEBOOK', { caption: 'x', media: [] }, opt({ firstComment: 'y'.repeat(8001) })))).toContain('8,000');
  });
});

describe('post options: Graph API requests', () => {
  const account = { id: 'acc', externalId: '1789', accessToken: 'tok', metadata: {}, scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments'] };
  const hooks = { saveState: async () => {}, beforeFinalCall: async () => {} };
  const pub = (url: string, kind: 'IMAGE' | 'VIDEO', id: string) => ({ id, kind, mimeType: kind === 'IMAGE' ? 'image/jpeg' : 'video/mp4', url, durationSec: kind === 'VIDEO' ? 20 : null });
  const base = (over: Partial<PublishInput>): PublishInput => ({
    account,
    format: 'FEED',
    caption: 'Caption',
    linkUrl: null,
    media: [],
    idempotencyKey: 'k',
    providerState: null,
    options: DEFAULT_OPTIONS,
    ...over,
  });
  const igGraph = () => {
    let n = 0;
    const fg = fakeGraph([
      ['GET', /content_publishing_limit$/, () => ({ body: { data: [] } })],
      ['POST', /^1789\/media$/, ({ params }) => ({ body: { id: params.get('media_type') === 'CAROUSEL' ? 'parent' : `c${++n}` } })],
      ['GET', /^(c\d|parent)$/, () => ({ body: { status_code: 'FINISHED' } })],
      ['POST', /^1789\/media_publish$/, () => ({ body: { id: 'live1' } })],
      ['GET', /^live1$/, () => ({ body: { permalink: 'https://instagram.com/p/x' } })],
      ['POST', /^live1\/comments$/, () => ({ body: { id: 'cm1' } })],
    ]);
    return { ...fg, ig: new InstagramAdapter(new GraphClient({ version: 'v23.0', fetchImpl: fg.fetchImpl }), { pollIntervalMs: 1, maxWaitMs: 50, sleep: async () => {} }) };
  };

  it('publishes a Story without caption or collaborators', async () => {
    const { ig, calls } = igGraph();
    await ig.publish(base({ format: 'STORY', caption: 'ignored', media: [pub('https://app.test/s', 'IMAGE', 's')], options: opt({ igType: 'story' }) }), hooks);
    const c = calls.find((x) => x.path === '1789/media')!.params;
    expect(c.get('media_type')).toBe('STORIES');
    expect(c.get('image_url')).toBe('https://app.test/s');
    expect(c.has('caption')).toBe(false);
    expect(c.has('collaborators')).toBe(false);
  });

  it('sends collaborators, tags, share-to-feed and cover frame for a Reel', async () => {
    const { ig, calls } = igGraph();
    await ig.publish(
      base({
        format: 'REEL',
        media: [pub('https://app.test/v', 'VIDEO', 'v')],
        options: opt({ collaborators: ['partner'], userTags: [{ username: 'friend', mediaId: null, x: 0.2, y: 0.3 }], shareToFeed: false, coverOffsetSec: 2.5 }),
      }),
      hooks,
    );
    const c = calls.find((x) => x.path === '1789/media')!.params;
    expect(c.get('media_type')).toBe('REELS');
    expect(JSON.parse(c.get('collaborators')!)).toEqual(['partner']);
    expect(JSON.parse(c.get('user_tags')!)).toEqual([{ username: 'friend' }]);
    expect(c.get('share_to_feed')).toBe('false');
    expect(c.get('thumb_offset')).toBe('2500');
  });

  it('tags people on the right carousel photo and puts collaborators on the carousel', async () => {
    const { ig, calls } = igGraph();
    await ig.publish(
      base({
        format: 'CAROUSEL',
        media: [pub('https://app.test/a', 'IMAGE', 'a'), pub('https://app.test/b', 'IMAGE', 'b')],
        options: opt({ collaborators: ['partner'], userTags: [{ username: 'friend', mediaId: 'b', x: 0.25, y: 0.75 }] }),
      }),
      hooks,
    );
    const children = calls.filter((x) => x.path === '1789/media' && x.params.get('is_carousel_item') === 'true');
    expect(children[0]!.params.has('user_tags')).toBe(false);
    expect(JSON.parse(children[1]!.params.get('user_tags')!)).toEqual([{ username: 'friend', x: 0.25, y: 0.75 }]);
    expect(children.every((x) => !x.params.has('collaborators'))).toBe(true);
    const parent = calls.find((x) => x.params.get('media_type') === 'CAROUSEL')!.params;
    expect(JSON.parse(parent.get('collaborators')!)).toEqual(['partner']);
  });

  it('posts comments on Instagram and Facebook posts', async () => {
    const { ig, calls } = igGraph();
    expect(await ig.postComment(account, 'live1', 'First!')).toEqual({ externalId: 'cm1' });
    expect(calls.at(-1)!.params.get('message')).toBe('First!');
    expect(ig.capabilities({ scopes: ['instagram_basic', 'instagram_content_publish'] }).firstComment).toBe(false);

    const fg = fakeGraph([['POST', /^99_1\/comments$/, () => ({ body: { id: 'fbc' } })]]);
    const fb = new FacebookAdapter(new GraphClient({ version: 'v23.0', fetchImpl: fg.fetchImpl }));
    expect(await fb.postComment(account, '99_1', 'Hello')).toEqual({ externalId: 'fbc' });
    expect(fb.capabilities({ scopes: ['pages_manage_posts', 'pages_manage_engagement'] }).firstComment).toBe(true);
  });
});

describe('post options: saving and publishing', () => {
  afterEach(() => setAdaptersForTesting(undefined));

  it('saves Story posts with the STORY format and keeps options per channel', async () => {
    const { ws, ctx } = await makeWorkspace('Story Co');
    const ig = await makeChannel(ws.id, 'INSTAGRAM');
    const img = await uploadImage(ctx, 1080, 1920);
    const post = await createPost(ctx, {
      baseMediaIds: [img.id],
      versions: [{ socialAccountId: ig.id, options: { igType: 'story' } }],
    });
    expect(post.versions[0]).toMatchObject({ format: 'STORY', options: { igType: 'story' } });
    // Post-only options are dropped from a Story.
    const story = await createPost(ctx, {
      baseMediaIds: [img.id],
      versions: [{ socialAccountId: ig.id, options: { igType: 'story', firstComment: 'no', collaborators: ['a'] } }],
    });
    expect(story.versions[0]!.options).toMatchObject({ firstComment: '', collaborators: [] });
    // Rules are enforced when scheduling: a carousel can't be a Story.
    const img2 = await uploadImage(ctx);
    const bad = await createPost(ctx, { baseMediaIds: [img.id, img2.id], versions: [{ socialAccountId: ig.id, options: { igType: 'story' } }] });
    await expect(schedulePost(ctx, bad.id, { type: 'publish_now' })).rejects.toMatchObject({ status: 422 });
  });

  it('posts the first comment after publishing; a failure keeps the post published and can be retried', async () => {
    const { ws, ctx } = await makeWorkspace('Comment Co');
    const fb = await makeChannel(ws.id, 'FACEBOOK');
    const ok = await createPost(ctx, {
      baseCaption: 'Launch day',
      versions: [{ socialAccountId: fb.id, options: { firstComment: 'Link in bio 👉 #launch' } }],
      action: { type: 'publish_now' },
    });
    const okId = ok.versions[0]!.id;
    expect(await processPublish(okId, { workerId: 'w' })).toBe('published');
    const okRow = await db.platformPost.findUniqueOrThrow({ where: { id: okId } });
    expect(okRow.firstCommentId).toMatch(/^mock_comment_/);
    expect(MockAdapter.comments.get(okRow.externalId!)).toEqual(['Link in bio 👉 #launch']);
    await expect(retryFirstComment(ctx, okId)).rejects.toMatchObject({ status: 409 });

    const failing = await createPost(ctx, {
      baseCaption: 'Second',
      versions: [{ socialAccountId: fb.id, options: { firstComment: 'nope #mock-commentfail' } }],
      action: { type: 'publish_now' },
    });
    const failId = failing.versions[0]!.id;
    expect(await processPublish(failId, { workerId: 'w' })).toBe('published');
    const detail = await getPost(ctx, failing.id);
    expect(detail.status).toBe('PUBLISHED');
    expect(detail.versions[0]!.firstComment).toMatchObject({ id: null, error: expect.stringContaining('rejected') });
    // Manual retry runs again (and fails again here), without touching the post.
    expect((await retryFirstComment(ctx, failId)).outcome).toBe('failed');

    const other = await makeWorkspace('Not yours');
    await expect(retryFirstComment(other.ctx, failId)).rejects.toMatchObject({ status: 404 });
  });

  it('only one caller posts the first comment', async () => {
    const { ws, ctx } = await makeWorkspace('Once Co');
    const fb = await makeChannel(ws.id, 'FACEBOOK');
    const post = await createPost(ctx, { baseCaption: 'x', versions: [{ socialAccountId: fb.id, options: { firstComment: 'once' } }], action: { type: 'publish_now' } });
    const id = post.versions[0]!.id;
    // Publish without the automatic comment by clearing it, then restore and race two retries.
    await db.platformPost.update({ where: { id }, data: { options: { firstComment: '' } } });
    await processPublish(id, { workerId: 'w' });
    await db.platformPost.update({ where: { id }, data: { options: { firstComment: 'once' } } });
    const results = await Promise.allSettled([retryFirstComment(ctx, id), retryFirstComment(ctx, id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const row = await db.platformPost.findUniqueOrThrow({ where: { id } });
    expect(MockAdapter.comments.get(row.externalId!)).toEqual(['once']);
  });
});
