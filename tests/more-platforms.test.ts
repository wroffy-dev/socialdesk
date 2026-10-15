import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { encrypt, decrypt } from '@/server/crypto';
import { storage } from '@/server/storage';
import { XAdapter } from '@/server/adapters/x';
import { LinkedInAdapter, toLittleText } from '@/server/adapters/linkedin';
import { YouTubeAdapter } from '@/server/adapters/youtube';
import { setAdaptersForTesting } from '@/server/adapters/registry';
import type { PublishInput, PublishMedia } from '@/server/adapters/types';
import { xProvider } from '@/server/integrations/x-oauth';
import { setOAuthFetchForTesting } from '@/server/integrations/oauth-http';
import { accountRef } from '@/server/integrations/tokens';
import { resetEnvCache } from '@/server/env';
import { processPublish } from '@/server/publishing/publisher';
import { reconcile } from '@/server/publishing/reconciler';
import { confirmPendingConnection, getPendingConnection, handleCallback, startConnect } from '@/server/services/channels';
import { createPost, schedulePost } from '@/server/services/posts';
import { DEFAULT_OPTIONS, normalizeOptions, youtubeTitle, type VersionOptions } from '@/lib/post-options';
import { errorsOnly, inferFormat, validateVersion, xLength, type MediaFacts } from '@/lib/platforms';
import { makeChannel, makeWorkspace } from './helpers/factories';
import { uploadImage } from './helpers/media';
import { fakeHttp } from './helpers/fake-http';

const opt = (o: Partial<VersionOptions>): VersionOptions => ({ ...DEFAULT_OPTIONS, ...o });
const image = (id = 'i', mimeType = 'image/jpeg', sizeBytes = 100_000): MediaFacts => ({ id, kind: 'IMAGE', mimeType, sizeBytes, width: 1080, height: 1080 });
const video = (id = 'v', durationSec = 20, w = 1080, h = 1920): MediaFacts => ({ id, kind: 'VIDEO', mimeType: 'video/mp4', sizeBytes: 5_000_000, width: w, height: h, durationSec });
const msgs = (i: { message: string }[]) => i.map((x) => x.message).join(' | ');
const noHooks = () => {
  const state: Record<string, unknown>[] = [];
  let final = 0;
  return { state, get final() { return final; }, hooks: { saveState: async (s: Record<string, unknown>) => void state.push(s), beforeFinalCall: async () => void final++ } };
};
const bytesMedia = (id: string, kind: 'IMAGE' | 'VIDEO', data: Buffer, extra: Partial<PublishMedia> = {}): PublishMedia => ({
  id,
  kind,
  mimeType: kind === 'IMAGE' ? 'image/jpeg' : 'video/mp4',
  url: `https://app.test/m/${id}`,
  durationSec: kind === 'VIDEO' ? 20 : null,
  sizeBytes: data.length,
  read: async (s, e) => data.subarray(s, e),
  ...extra,
});
const input = (over: Partial<PublishInput>): PublishInput => ({
  account: { id: 'acc', externalId: '42', accessToken: 'tok', metadata: {}, scopes: [] },
  format: 'TEXT',
  caption: 'Hello',
  linkUrl: null,
  media: [],
  idempotencyKey: 'k',
  providerState: null,
  options: DEFAULT_OPTIONS,
  ...over,
});

afterEach(() => {
  setAdaptersForTesting(undefined);
  setOAuthFetchForTesting(undefined);
});

describe('rules for X, LinkedIn and YouTube', () => {
  it('counts X length like X does and enforces media rules', () => {
    expect(xLength('hello')).toBe(5);
    expect(xLength('see https://example.com/a/very/long/path?x=1')).toBe(4 + 23);
    expect(xLength('👋')).toBe(2);
    expect(msgs(validateVersion('X', { caption: 'x'.repeat(281), media: [] }))).toContain('X allows 280');
    expect(errorsOnly(validateVersion('X', { caption: 'x'.repeat(256), media: [], linkUrl: 'https://example.com' }))).toHaveLength(0);
    expect(msgs(validateVersion('X', { caption: 'hi', media: [image('1'), image('2'), image('3'), image('4'), image('5')] }))).toContain('up to 4 images');
    expect(msgs(validateVersion('X', { caption: 'hi', media: [image('1'), video('2')] }))).toContain('must be the only media');
    expect(msgs(validateVersion('X', { caption: 'hi', media: [video('2', 200)] }))).toContain('0.5 and 140 seconds');
    expect(msgs(validateVersion('X', { caption: 'hi', media: [] }, opt({ firstComment: 'y'.repeat(281) })))).toContain('Reply is 281');
    expect(inferFormat('X', { caption: 'hi', media: [image()] })).toBe('FEED');
  });

  it('LinkedIn: 3,000 characters, no mixing video and images, MP4 video', () => {
    expect(msgs(validateVersion('LINKEDIN', { caption: 'x'.repeat(3001), media: [] }))).toContain('3,000');
    expect(msgs(validateVersion('LINKEDIN', { caption: 'x', media: [image(), video()] }))).toContain("can't mix");
    expect(msgs(validateVersion('LINKEDIN', { caption: 'x', media: [{ ...video(), mimeType: 'video/quicktime' }] }))).toContain('must be MP4');
    expect(inferFormat('LINKEDIN', { caption: 'x', media: [], linkUrl: 'https://a.b' })).toBe('LINK');
  });

  it('YouTube: one video, a title, Shorts detection and option normalisation', () => {
    expect(msgs(validateVersion('YOUTUBE', { caption: 'x', media: [image()] }))).toContain('exactly one video');
    expect(msgs(validateVersion('YOUTUBE', { caption: '', media: [video()] }))).toContain('Add a YouTube title');
    expect(errorsOnly(validateVersion('YOUTUBE', { caption: 'My video\nmore text', media: [video()] }))).toHaveLength(0);
    expect(youtubeTitle('My video\nmore text', { ytTitle: '' })).toBe('My video');
    expect(msgs(validateVersion('YOUTUBE', { caption: 'x', media: [video()] }, opt({ ytTitle: 't'.repeat(101) })))).toContain('at most 100');
    expect(inferFormat('YOUTUBE', { caption: '', media: [video('v', 60)] })).toBe('SHORT');
    expect(inferFormat('YOUTUBE', { caption: '', media: [video('v', 600)] })).toBe('VIDEO');
    expect(inferFormat('YOUTUBE', { caption: '', media: [video('v', 60, 1920, 1080)] })).toBe('VIDEO');

    const raw = { ytTitle: 'T', ytPrivacy: 'unlisted', ytTags: ['a', 'a'], collaborators: ['x'], firstComment: 'c' };
    expect(normalizeOptions('YOUTUBE', raw)).toMatchObject({ ytTitle: 'T', ytPrivacy: 'unlisted', ytTags: ['a'], collaborators: [], firstComment: 'c' });
    expect(normalizeOptions('X', raw)).toEqual({ ...DEFAULT_OPTIONS, firstComment: 'c' });
    expect(normalizeOptions('INSTAGRAM', raw)).toMatchObject({ ytTitle: '', ytPrivacy: 'public', collaborators: ['x'] });
  });

  it('escapes LinkedIn markup while keeping hashtags', () => {
    expect(toLittleText('Big (news) for @team_a #launch!')).toBe('Big \\(news\\) for \\@team\\_a {hashtag|\\#|launch}!');
  });
});

describe('X adapter', () => {
  it('uploads media in chunks, then posts once with the media ids; the reply targets the post', async () => {
    const { fetchImpl, calls } = fakeHttp([
      ['POST', /api\.x\.com\/2\/media\/upload\/initialize$/, () => ({ body: { data: { id: 'm1' } } })],
      ['POST', /api\.x\.com\/2\/media\/upload\/m1\/append$/, () => ({ status: 204 })],
      ['POST', /api\.x\.com\/2\/media\/upload\/m1\/finalize$/, () => ({ body: { data: { id: 'm1' } } })],
      ['POST', /api\.x\.com\/2\/tweets$/, (r) => ({ status: 201, body: { data: { id: (r.json as { reply?: unknown }).reply ? 'reply1' : 't1' } } })],
    ]);
    const x = new XAdapter({ fetchImpl });
    const h = noHooks();
    const data = Buffer.alloc(5 * 1024 * 1024, 1);
    const res = await x.publish(
      input({ caption: 'Launch', linkUrl: 'https://example.com', media: [bytesMedia('a', 'IMAGE', data)], account: { id: 'a', externalId: '42', accessToken: 'tok', metadata: { username: 'brand' }, scopes: [] } }),
      h.hooks,
    );
    expect(res).toEqual({ externalId: 't1', externalUrl: 'https://x.com/brand/status/t1' });
    expect(calls.filter((c) => c.url.pathname.endsWith('/append'))).toHaveLength(2); // 4 MB chunks
    const tweet = calls.find((c) => c.url.pathname === '/2/tweets')!;
    expect(tweet.json).toEqual({ text: 'Launch https://example.com', media: { media_ids: ['m1'] } });
    expect(tweet.headers.get('authorization')).toBe('Bearer tok');
    expect(h.final).toBe(1);
    expect(h.state.at(-1)).toMatchObject({ media: { a: { id: 'm1' } } });

    expect(await x.postComment({ id: 'a', externalId: '42', accessToken: 'tok', metadata: {}, scopes: [] }, 't1', 'more')).toEqual({ externalId: 'reply1' });
    expect(calls.at(-1)!.json).toEqual({ text: 'more', reply: { in_reply_to_tweet_id: 't1' } });
  });

  it('classifies X errors', async () => {
    const make = (status: number, body: unknown, headers?: Record<string, string>) =>
      new XAdapter({ fetchImpl: fakeHttp([['POST', /tweets$/, () => ({ status, body, headers })]]).fetchImpl });
    await expect(make(403, { detail: 'You are not allowed to create a Tweet with duplicate content.' }).publish(input({}), noHooks().hooks)).rejects.toMatchObject({
      kind: 'permanent',
      message: expect.stringContaining('duplicate'),
    });
    await expect(make(401, { title: 'Unauthorized' }).publish(input({}), noHooks().hooks)).rejects.toMatchObject({ kind: 'auth' });
    await expect(make(429, {}, { 'retry-after': '120' }).publish(input({}), noHooks().hooks)).rejects.toMatchObject({ kind: 'transient', retryAfterSec: 120 });
    await expect(make(503, {}).publish(input({}), noHooks().hooks)).rejects.toMatchObject({ kind: 'ambiguous' });
  });
});

describe('LinkedIn adapter', () => {
  it('uploads an image and creates the post as the page, with escaped text', async () => {
    const { fetchImpl, calls } = fakeHttp([
      ['POST', /api\.linkedin\.com\/rest\/images$/, () => ({ body: { value: { uploadUrl: 'https://upload.linkedin.test/img1', image: 'urn:li:image:1' } } })],
      ['PUT', /upload\.linkedin\.test\/img1$/, () => ({ status: 201 })],
      ['POST', /api\.linkedin\.com\/rest\/posts$/, () => ({ status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } })],
    ]);
    const li = new LinkedInAdapter({ fetchImpl, version: '202608' });
    const account = { id: 'a', externalId: '77', accessToken: 'tok', metadata: { urn: 'urn:li:organization:77' }, scopes: ['w_organization_social'] };
    const res = await li.publish(input({ account, caption: 'Hello #world', media: [bytesMedia('p', 'IMAGE', Buffer.from('jpeg'))] }), noHooks().hooks);
    expect(res).toEqual({ externalId: 'urn:li:share:9', externalUrl: 'https://www.linkedin.com/feed/update/urn:li:share:9/' });
    expect(calls[0]!.json).toEqual({ initializeUploadRequest: { owner: 'urn:li:organization:77' } });
    expect(calls[1]!.bytes && Buffer.from(calls[1]!.bytes).toString()).toBe('jpeg');
    const post = calls[2]!;
    expect(post.headers.get('linkedin-version')).toBe('202608');
    expect(post.json).toMatchObject({ author: 'urn:li:organization:77', commentary: 'Hello {hashtag|\\#|world}', content: { media: { id: 'urn:li:image:1' } }, lifecycleState: 'PUBLISHED' });
    expect(li.capabilities({ scopes: ['w_member_social'], metadata: account.metadata }).publish).toBe(false);
    expect(li.capabilities({ scopes: ['w_member_social'], metadata: { urn: 'urn:li:person:1' } }).publish).toBe(true);
  });

  it('posts links as articles and treats 403 as a permission problem', async () => {
    const { fetchImpl, calls } = fakeHttp([['POST', /rest\/posts$/, () => ({ status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } })]]);
    await new LinkedInAdapter({ fetchImpl }).publish(input({ caption: 'Read this', linkUrl: 'https://blog.example.com/post' }), noHooks().hooks);
    expect(calls[0]!.json).toMatchObject({ author: 'urn:li:person:42', content: { article: { source: 'https://blog.example.com/post', title: 'blog.example.com' } } });
    const denied = new LinkedInAdapter({ fetchImpl: fakeHttp([['POST', /rest\/posts$/, () => ({ status: 403, body: { message: 'Not enough permissions' } })]]).fetchImpl });
    await expect(denied.publish(input({}), noHooks().hooks)).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('YouTube adapter', () => {
  const ytInput = (data: Buffer, over: Partial<PublishInput> = {}) =>
    input({ format: 'VIDEO', caption: 'Title line\nDescription', media: [bytesMedia('v', 'VIDEO', data)], options: opt({ ytPrivacy: 'unlisted', ytMadeForKids: false }), ...over });

  it('uploads resumably; the last chunk is the final call', async () => {
    const data = Buffer.alloc(9 * 1024 * 1024, 2);
    const { fetchImpl, calls } = fakeHttp([
      ['POST', /upload\/youtube\/v3\/videos$/, () => ({ headers: { location: 'https://upload.yt.test/session1' } })],
      [
        'PUT',
        /upload\.yt\.test\/session1$/,
        (r) => {
          const range = r.headers.get('content-range')!;
          const end = Number(range.split(' ')[1]!.split('-')[1]!.split('/')[0]);
          return end + 1 < data.length ? { status: 308, headers: { range: `bytes=0-${end}` } } : { status: 201, body: { id: 'vid1' } };
        },
      ],
    ]);
    const h = noHooks();
    const res = await new YouTubeAdapter({ fetchImpl }).publish(ytInput(data), h.hooks);
    expect(res).toEqual({ externalId: 'vid1', externalUrl: 'https://www.youtube.com/watch?v=vid1' });
    const init = calls[0]!;
    expect(init.url.searchParams.get('uploadType')).toBe('resumable');
    expect(init.headers.get('x-upload-content-length')).toBe(String(data.length));
    expect(init.json).toMatchObject({ snippet: { title: 'Title line', description: 'Title line\nDescription' }, status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false } });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
    expect(h.final).toBe(1);
    expect(h.state.at(-1)).toMatchObject({ videoId: 'vid1' });
  });

  it('resumes an interrupted upload and verifies uncertain uploads from the session', async () => {
    const data = Buffer.alloc(1000, 3);
    const { fetchImpl, calls } = fakeHttp([
      [
        'PUT',
        /upload\.yt\.test\/s2$/,
        (r) => (r.headers.get('content-range') === `bytes */${data.length}` ? { status: 308, headers: { range: 'bytes=0-399' } } : { status: 200, body: { id: 'vid2' } }),
      ],
    ]);
    const yt = new YouTubeAdapter({ fetchImpl });
    const state = { uploadUrl: 'https://upload.yt.test/s2', startedAt: new Date().toISOString(), mediaId: 'v' };
    const res = await yt.publish(ytInput(data, { providerState: state }), noHooks().hooks);
    expect(res.externalId).toBe('vid2');
    expect(calls.at(-1)!.headers.get('content-range')).toBe(`bytes 400-999/${data.length}`);

    const done = fakeHttp([['PUT', /s3$/, () => ({ status: 200, body: { id: 'vid3' } })]]);
    expect(await new YouTubeAdapter({ fetchImpl: done.fetchImpl }).verifyPublish(ytInput(data, { providerState: { uploadUrl: 'https://upload.yt.test/s3' } }))).toMatchObject({
      status: 'published',
      externalId: 'vid3',
    });
    const partial = fakeHttp([['PUT', /s4$/, () => ({ status: 308 })]]);
    expect(await new YouTubeAdapter({ fetchImpl: partial.fetchImpl }).verifyPublish(ytInput(data, { providerState: { uploadUrl: 'https://upload.yt.test/s4' } }))).toEqual({
      status: 'not_published',
    });
  });

  it('defers when the daily quota is used up', async () => {
    const { fetchImpl } = fakeHttp([['POST', /upload\/youtube/, () => ({ status: 403, body: { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } } })]]);
    await expect(new YouTubeAdapter({ fetchImpl }).publish(ytInput(Buffer.alloc(10)), noHooks().hooks)).rejects.toMatchObject({ kind: 'transient', retryAfterSec: 3 * 3600 });
  });
});

describe('OAuth and tokens for the new providers', () => {
  const withX = () => {
    process.env.X_CLIENT_ID = 'xid';
    process.env.X_CLIENT_SECRET = 'xsecret';
    resetEnvCache();
  };
  const withoutX = () => {
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    resetEnvCache();
  };

  it('X: PKCE challenge in the auth URL, verifier sent with the code', async () => {
    withX();
    try {
      const url = new URL(xProvider.authUrl('st', 'challenge123'));
      expect(url.searchParams.get('code_challenge')).toBe('challenge123');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')).toContain('offline.access');
      const { fetchImpl, calls } = fakeHttp([
        ['POST', /api\.x\.com\/2\/oauth2\/token$/, () => ({ body: { access_token: 'at', refresh_token: 'rt', expires_in: 7200, scope: 'tweet.read tweet.write users.read media.write offline.access' } })],
        ['GET', /api\.x\.com\/2\/users\/me$/, () => ({ body: { data: { id: '99', name: 'Brand', username: 'brand' } } })],
      ]);
      setOAuthFetchForTesting(fetchImpl);
      const d = await xProvider.discover('code1', 'verifier1');
      expect(calls[0]!.form!.get('code_verifier')).toBe('verifier1');
      expect(calls[0]!.headers.get('authorization')).toBe(`Basic ${Buffer.from('xid:xsecret').toString('base64')}`);
      expect(d.accounts[0]).toMatchObject({ platform: 'X', externalId: '99', username: 'brand', refreshToken: 'rt' });
      expect(d.declined).toEqual([]);
    } finally {
      withoutX();
    }
  });

  it('refreshes an expiring token once even when jobs ask concurrently; a revoked one needs reconnecting', async () => {
    withX();
    try {
      const { ws } = await makeWorkspace('Token Co');
      const acc = await makeChannel(ws.id, 'X');
      await db.socialAccount.update({
        where: { id: acc.id },
        data: { mode: 'LIVE', accessTokenEnc: encrypt('old'), refreshTokenEnc: encrypt('r1'), tokenExpiresAt: new Date(Date.now() + 60_000) },
      });
      let n = 0;
      const { fetchImpl } = fakeHttp([['POST', /oauth2\/token$/, () => ({ body: { access_token: `new${++n}`, refresh_token: `r${n + 1}`, expires_in: 7200 } })]]);
      setOAuthFetchForTesting(fetchImpl);
      const row = await db.socialAccount.findUniqueOrThrow({ where: { id: acc.id } });
      const refs = await Promise.all([accountRef(row), accountRef(row), accountRef(row)]);
      expect(n).toBe(1);
      expect(refs.map((r) => r.accessToken)).toEqual(['new1', 'new1', 'new1']);
      const after = await db.socialAccount.findUniqueOrThrow({ where: { id: acc.id } });
      expect(decrypt(after.refreshTokenEnc!)).toBe('r2');
      expect(after.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 3600_000);

      await db.socialAccount.update({ where: { id: acc.id }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
      setOAuthFetchForTesting(fakeHttp([['POST', /oauth2\/token$/, () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'Value passed for the token was invalid.' } })]]).fetchImpl);
      await expect(accountRef(await db.socialAccount.findUniqueOrThrow({ where: { id: acc.id } }))).rejects.toMatchObject({ kind: 'auth' });
      expect((await db.socialAccount.findUniqueOrThrow({ where: { id: acc.id } })).status).toBe('NEEDS_REAUTH');
    } finally {
      withoutX();
    }
  });

  it('connects mock X, LinkedIn (profile or page) and YouTube channels into a project', async () => {
    const { ctx } = await makeWorkspace('Five Co');
    const project = await db.project.findFirstOrThrow({ where: { workspaceId: ctx.workspace.id } });
    const connect = async (platform: 'X' | 'LINKEDIN' | 'YOUTUBE', provider: 'x' | 'linkedin' | 'google', pick = 0) => {
      const { state, redirectUrl } = await startConnect(ctx, project.id, platform);
      expect(redirectUrl).toContain(`/api/oauth/${provider}/callback?code=mock`);
      const res = await handleCallback(provider, ctx.user, { code: 'mock', state }, state);
      if (!res.ok) throw new Error(res.message);
      const pending = await getPendingConnection(ctx, res.pendingId);
      expect(pending.accounts.every((a) => a.platform === platform)).toBe(true);
      await confirmPendingConnection(ctx, res.pendingId, pending.accounts[pick]!.key);
      return pending;
    };
    await connect('X', 'x');
    const li = await connect('LINKEDIN', 'linkedin', 1);
    expect(li.accounts.map((a) => a.name)).toEqual(['Mock LinkedIn Member', 'Mock LinkedIn Page 1']);
    await connect('YOUTUBE', 'google');
    const rows = await db.socialAccount.findMany({ where: { projectId: project.id }, orderBy: { platform: 'asc' } });
    expect(rows.map((r) => r.platform).sort()).toEqual(['LINKEDIN', 'X', 'YOUTUBE']);
    expect(rows.find((r) => r.platform === 'LINKEDIN')!.metadata).toMatchObject({ urn: expect.stringContaining('urn:li:organization:') });
    // A provider callback can't be replayed against another provider.
    const { state } = await startConnect(ctx, project.id, 'X');
    expect(await handleCallback('google', ctx.user, { code: 'mock', state }, state)).toMatchObject({ ok: false });
  });
});

describe('publishing to the new platforms', () => {
  it('publishes a YouTube video end to end: bytes from storage, resumable upload, first comment', async () => {
    const { ws, ctx } = await makeWorkspace('Tube Co');
    const ch = await makeChannel(ws.id, 'YOUTUBE');
    await db.socialAccount.update({ where: { id: ch.id }, data: { mode: 'LIVE', scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'] } });
    const data = Buffer.alloc(300_000, 9);
    const key = `test/${ws.id}/clip.mp4`;
    await storage().putBuffer(key, data);
    const asset = await db.mediaAsset.create({
      data: { workspaceId: ws.id, kind: 'VIDEO', originalName: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: data.length, width: 1080, height: 1920, durationSec: 30, storageKey: key, checksum: 'x' },
    });
    const uploaded: Buffer[] = [];
    const { fetchImpl, calls } = fakeHttp([
      ['POST', /upload\/youtube\/v3\/videos$/, () => ({ headers: { location: 'https://upload.yt.test/e2e' } })],
      [
        'PUT',
        /upload\.yt\.test\/e2e$/,
        (r) => {
          uploaded.push(Buffer.from(r.bytes!));
          return { status: 201, body: { id: 'short1' } };
        },
      ],
      ['POST', /youtube\/v3\/commentThreads$/, () => ({ body: { id: 'c1' } })],
    ]);
    setAdaptersForTesting({ YOUTUBE: new YouTubeAdapter({ fetchImpl }) });
    const post = await createPost(ctx, {
      baseCaption: 'Behind the scenes',
      baseMediaIds: [asset.id],
      versions: [{ socialAccountId: ch.id, options: { ytPrivacy: 'public', firstComment: 'Thanks for watching!' } }],
      action: { type: 'publish_now' },
    });
    expect(post.versions[0]!.format).toBe('SHORT');
    expect(await processPublish(post.versions[0]!.id, { workerId: 'w' })).toBe('published');
    const v = await db.platformPost.findUniqueOrThrow({ where: { id: post.versions[0]!.id } });
    expect(v).toMatchObject({ externalId: 'short1', externalUrl: 'https://www.youtube.com/shorts/short1', firstCommentId: 'c1' });
    expect(Buffer.concat(uploaded).equals(data)).toBe(true);
    expect(calls.at(-1)!.json).toEqual({ snippet: { videoId: 'short1', topLevelComment: { snippet: { textOriginal: 'Thanks for watching!' } } } });
  });

  it('publishes to mock X and LinkedIn, and blocks a YouTube post without video', async () => {
    const { ws, ctx } = await makeWorkspace('Mock Five');
    const x = await makeChannel(ws.id, 'X');
    const li = await makeChannel(ws.id, 'LINKEDIN', x.projectId);
    const yt = await makeChannel(ws.id, 'YOUTUBE', x.projectId);
    const post = await createPost(ctx, { baseCaption: 'Short update', versions: [{ socialAccountId: x.id }, { socialAccountId: li.id }], action: { type: 'publish_now' } });
    for (const v of post.versions) expect(await processPublish(v.id, { workerId: 'w' })).toBe('published');
    const img = await uploadImage(ctx);
    const bad = await createPost(ctx, { baseCaption: 'No video', baseMediaIds: [img.id], versions: [{ socialAccountId: yt.id }] });
    await expect(schedulePost(ctx, bad.id, { type: 'publish_now' })).rejects.toMatchObject({ status: 422 });
    await reconcile();
  });
});
