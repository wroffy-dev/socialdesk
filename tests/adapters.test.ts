import { describe, expect, it } from 'vitest';
import { GraphClient, classifyGraphError } from '@/server/adapters/meta/graph';
import { FacebookAdapter } from '@/server/adapters/meta/facebook';
import { InstagramAdapter } from '@/server/adapters/meta/instagram';
import { AdapterError, type PublishInput } from '@/server/adapters/types';
import { parseSignedRequest } from '@/server/integrations/meta-signed-request';
import { createHmac } from 'node:crypto';
import { fakeGraph } from './helpers/fake-graph';
import { DEFAULT_OPTIONS } from '@/lib/post-options';

const account = { id: 'acc', externalId: '1789', accessToken: 'tok', metadata: {}, scopes: ['instagram_basic', 'instagram_content_publish', 'pages_manage_posts'] };
const hooks = () => {
  const saved: Record<string, unknown>[] = [];
  let finalCalls = 0;
  return { saved, get finalCalls() { return finalCalls; }, hooks: { saveState: async (s: Record<string, unknown>) => void saved.push(s), beforeFinalCall: async () => void finalCalls++ } };
};
const input = (over: Partial<PublishInput>): PublishInput => ({
  account,
  format: 'FEED',
  caption: 'Hello world',
  linkUrl: null,
  media: [],
  idempotencyKey: 'key-1',
  providerState: null,
  options: DEFAULT_OPTIONS,
  ...over,
});
const img = (id: string) => ({ id, kind: 'IMAGE' as const, mimeType: 'image/jpeg', url: `https://app.test/m/${id}`, durationSec: null });
const vid = (id: string) => ({ id, kind: 'VIDEO' as const, mimeType: 'video/mp4', url: `https://app.test/m/${id}`, durationSec: 12 });

describe('Graph error classification', () => {
  it('maps codes to retry behaviour', () => {
    expect(classifyGraphError(400, { error: { code: 190, message: 'expired' } }, false).kind).toBe('auth');
    expect(classifyGraphError(400, { error: { code: 200, message: 'perm' } }, false).kind).toBe('auth');
    expect(classifyGraphError(400, { error: { code: 4, message: 'rate' } }, false)).toMatchObject({ kind: 'transient', retryAfterSec: 900 });
    expect(classifyGraphError(400, { error: { code: 100, message: 'bad param' } }, false).kind).toBe('permanent');
    expect(classifyGraphError(500, { error: { code: 2, message: 'svc' } }, false).kind).toBe('transient');
    // A server error on the call that makes the post public may have succeeded.
    expect(classifyGraphError(500, { error: { code: 2, message: 'svc' } }, true).kind).toBe('ambiguous');
  });

  it('treats a timeout on the final call as ambiguous but on other calls as transient', async () => {
    const hang = (async (_u: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as typeof fetch;
    const g = new GraphClient({ version: 'v23.0', fetchImpl: hang, timeoutMs: 20 });
    await expect(g.post('x/feed', 't', {}, true)).rejects.toMatchObject({ kind: 'ambiguous', code: 'timeout' });
    await expect(g.post('x/media', 't', {}, false)).rejects.toMatchObject({ kind: 'transient', code: 'timeout' });
  });

  it('adds appsecret_proof when an app secret is configured', async () => {
    const { fetchImpl, calls } = fakeGraph([['GET', /^me$/, () => ({ body: { id: '1' } })]]);
    await new GraphClient({ version: 'v23.0', appSecret: 's3cret', fetchImpl }).get('me', 'tok');
    expect(calls[0]!.params.get('appsecret_proof')).toBe(createHmac('sha256', 's3cret').update('tok').digest('hex'));
  });
});

describe('Facebook adapter', () => {
  it('publishes a text post with link', async () => {
    const { fetchImpl, calls } = fakeGraph([['POST', /^1789\/feed$/, () => ({ body: { id: '1789_55' } })]]);
    const fb = new FacebookAdapter(new GraphClient({ version: 'v23.0', fetchImpl }));
    const h = hooks();
    const res = await fb.publish(input({ format: 'LINK', linkUrl: 'https://example.com' }), h.hooks);
    expect(res).toEqual({ externalId: '1789_55', externalUrl: 'https://www.facebook.com/1789_55' });
    expect(calls[0]!.params.get('link')).toBe('https://example.com');
    expect(h.finalCalls).toBe(1);
  });

  it('uploads photos unpublished, then attaches them; a retry reuses uploaded photos', async () => {
    let n = 0;
    const { fetchImpl, calls } = fakeGraph([
      ['POST', /^1789\/photos$/, () => ({ body: { id: `photo-${++n}` } })],
      ['POST', /^1789\/feed$/, () => ({ status: 500, body: { error: { code: 2, message: 'Service temporarily unavailable', is_transient: true } } })],
    ]);
    const fb = new FacebookAdapter(new GraphClient({ version: 'v23.0', fetchImpl }));
    const h = hooks();
    const err = await fb.publish(input({ media: [img('a'), img('b')] }), h.hooks).catch((e) => e);
    expect(err).toBeInstanceOf(AdapterError);
    expect(err.kind).toBe('ambiguous');
    expect(calls.filter((c) => c.path.endsWith('photos')).every((c) => c.params.get('published') === 'false')).toBe(true);
    const state = h.saved.at(-1)!;
    expect(state).toEqual({ photoIds: { a: 'photo-1', b: 'photo-2' } });

    const { fetchImpl: f2, calls: c2 } = fakeGraph([['POST', /^1789\/feed$/, () => ({ body: { id: '1789_77' } })]]);
    const fb2 = new FacebookAdapter(new GraphClient({ version: 'v23.0', fetchImpl: f2 }));
    const res = await fb2.publish(input({ media: [img('a'), img('b')], providerState: state }), hooks().hooks);
    expect(res.externalId).toBe('1789_77');
    expect(c2).toHaveLength(1);
    expect(JSON.parse(c2[0]!.params.get('attached_media[1]')!)).toEqual({ media_fbid: 'photo-2' });
  });

  it('publishes a video via file_url', async () => {
    const { fetchImpl, calls } = fakeGraph([['POST', /^1789\/videos$/, () => ({ body: { id: 'vid9' } })]]);
    const res = await new FacebookAdapter(new GraphClient({ version: 'v23.0', fetchImpl })).publish(input({ media: [vid('v')] }), hooks().hooks);
    expect(res.externalUrl).toBe('https://www.facebook.com/1789/videos/vid9');
    expect(calls[0]!.params.get('file_url')).toBe('https://app.test/m/v');
  });

  it('reports missing permissions as capabilities', () => {
    const caps = new FacebookAdapter(new GraphClient({ version: 'v23.0' })).capabilities({ scopes: ['pages_show_list'] });
    expect(caps.publish).toBe(false);
    expect(caps.missing.join(' ')).toContain('pages_manage_posts');
  });
});

describe('Instagram adapter', () => {
  const opts = { pollIntervalMs: 1, maxWaitMs: 50, sleep: async () => {} };

  it('creates a container, waits for it, publishes once and fetches the permalink', async () => {
    let polls = 0;
    const { fetchImpl, calls } = fakeGraph([
      ['GET', /content_publishing_limit$/, () => ({ body: { data: [{ quota_usage: 3, config: { quota_total: 100 } }] } })],
      ['POST', /^1789\/media$/, () => ({ body: { id: 'cont1' } })],
      ['GET', /^cont1$/, () => ({ body: { status_code: ++polls < 3 ? 'IN_PROGRESS' : 'FINISHED' } })],
      ['POST', /^1789\/media_publish$/, () => ({ body: { id: 'ig-media-1' } })],
      ['GET', /^ig-media-1$/, () => ({ body: { permalink: 'https://instagram.com/p/abc' } })],
    ]);
    const ig = new InstagramAdapter(new GraphClient({ version: 'v23.0', fetchImpl }), opts);
    const h = hooks();
    const res = await ig.publish(input({ media: [img('a')], caption: 'Caption #tag' }), h.hooks);
    expect(res).toEqual({ externalId: 'ig-media-1', externalUrl: 'https://instagram.com/p/abc' });
    expect(calls.filter((c) => c.path === '1789/media_publish')).toHaveLength(1);
    expect(h.saved.at(-1)).toMatchObject({ containerId: 'cont1' });
    expect(calls.find((c) => c.path === '1789/media')!.params.get('image_url')).toBe('https://app.test/m/a');
  });

  it('builds carousels from child containers', async () => {
    let n = 0;
    const { fetchImpl, calls } = fakeGraph([
      ['GET', /content_publishing_limit$/, () => ({ body: { data: [] } })],
      ['POST', /^1789\/media$/, ({ params }) => ({ body: { id: params.get('media_type') === 'CAROUSEL' ? 'parent' : `child${++n}` } })],
      ['GET', /^(child\d|parent)$/, () => ({ body: { status_code: 'FINISHED' } })],
      ['POST', /^1789\/media_publish$/, () => ({ body: { id: 'm2' } })],
      ['GET', /^m2$/, () => ({ body: {} })],
    ]);
    const ig = new InstagramAdapter(new GraphClient({ version: 'v23.0', fetchImpl }), opts);
    await ig.publish(input({ media: [img('a'), vid('b')] }), hooks().hooks);
    const parent = calls.find((c) => c.params.get('media_type') === 'CAROUSEL')!;
    expect(parent.params.get('children')).toBe('child1,child2');
    expect(calls.find((c) => c.params.get('media_type') === 'VIDEO')!.params.get('is_carousel_item')).toBe('true');
  });

  it('defers (transient) when video processing takes too long, keeping the container for the retry', async () => {
    const { fetchImpl } = fakeGraph([
      ['GET', /content_publishing_limit$/, () => ({ body: { data: [] } })],
      ['POST', /^1789\/media$/, () => ({ body: { id: 'slow' } })],
      ['GET', /^slow$/, () => ({ body: { status_code: 'IN_PROGRESS' } })],
    ]);
    const ig = new InstagramAdapter(new GraphClient({ version: 'v23.0', fetchImpl }), { ...opts, maxWaitMs: 0 });
    const h = hooks();
    await expect(ig.publish(input({ media: [vid('v')] }), h.hooks)).rejects.toMatchObject({ kind: 'transient', code: 'ig_processing' });
    expect(h.saved.at(-1)).toMatchObject({ containerId: 'slow' });
    expect(h.finalCalls).toBe(0);
  });

  it('never publishes a container twice: a resumed attempt finds the existing post', async () => {
    const created = new Date(Date.now() - 60_000).toISOString();
    const { fetchImpl, calls } = fakeGraph([
      ['GET', /content_publishing_limit$/, () => ({ body: { data: [] } })],
      ['GET', /^cont1$/, () => ({ body: { status_code: 'PUBLISHED' } })],
      ['GET', /^1789\/media$/, () => ({ body: { data: [{ id: 'live1', caption: 'Hello world', timestamp: new Date().toISOString(), permalink: 'https://instagram.com/p/live1' }] } })],
    ]);
    const ig = new InstagramAdapter(new GraphClient({ version: 'v23.0', fetchImpl }), opts);
    const res = await ig.publish(input({ media: [img('a')], providerState: { containerId: 'cont1', containerCreatedAt: created } }), hooks().hooks);
    expect(res.externalId).toBe('live1');
    expect(calls.some((c) => c.path.endsWith('media_publish'))).toBe(false);
  });

  it('verifies ambiguous publishes from the container status', async () => {
    const mk = (status: string) =>
      new InstagramAdapter(
        new GraphClient({
          version: 'v23.0',
          fetchImpl: fakeGraph([
            ['GET', /^c$/, () => ({ body: { status_code: status } })],
            ['GET', /^1789\/media$/, () => ({ body: { data: [{ id: 'x', caption: 'Hello world', timestamp: new Date().toISOString() }] } })],
          ]).fetchImpl,
        }),
        opts,
      );
    const i = input({ media: [img('a')], providerState: { containerId: 'c' } });
    expect((await mk('FINISHED').verifyPublish(i, new Date(Date.now() - 60_000))).status).toBe('not_published');
    expect(await mk('PUBLISHED').verifyPublish(i, new Date(Date.now() - 60_000))).toMatchObject({ status: 'published', externalId: 'x' });
  });

  it('stops at the 24-hour publishing limit', async () => {
    const { fetchImpl } = fakeGraph([['GET', /content_publishing_limit$/, () => ({ body: { data: [{ quota_usage: 100, config: { quota_total: 100 } }] } })]]);
    const ig = new InstagramAdapter(new GraphClient({ version: 'v23.0', fetchImpl }), opts);
    await expect(ig.publish(input({ media: [img('a')] }), hooks().hooks)).rejects.toMatchObject({ kind: 'transient', code: 'ig_quota' });
  });
});

describe('Meta signed_request', () => {
  it('verifies the HMAC signature', () => {
    const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '42' })).toString('base64url');
    const sig = createHmac('sha256', 'secret').update(payload).digest('base64url');
    expect(parseSignedRequest(`${sig}.${payload}`, 'secret')).toMatchObject({ user_id: '42' });
    expect(parseSignedRequest(`${sig}.${payload}`, 'wrong')).toBeNull();
    expect(parseSignedRequest('garbage', 'secret')).toBeNull();
  });
});
