import { xText } from '@/lib/platforms';
import { HttpClient, type HttpClientConfig } from './http';
import { AdapterError, type AccountRef, type Capabilities, type PublishHooks, type PublishInput, type PublishMedia, type PublishResult, type SocialAdapter, type VerifyOutcome } from './types';

const API = 'https://api.x.com/2';
const CHUNK = 4 * 1024 * 1024;
/** Uploaded media can be attached for 24 hours; reuse it only well inside that window. */
const MEDIA_REUSE_MS = 20 * 3600_000;

interface XState {
  media?: Record<string, { id: string; at: string }>;
}

interface XError {
  title?: string;
  detail?: string;
  type?: string;
  errors?: { message?: string; title?: string; detail?: string }[];
}

export interface XAdapterOptions extends HttpClientConfig {
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** X (Twitter) through the v2 API with OAuth 2.0 user tokens. */
export class XAdapter implements SocialAdapter {
  readonly platform = 'X' as const;
  private readonly http: HttpClient;
  private readonly maxWaitMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: XAdapterOptions = {}) {
    this.http = new HttpClient('X', {
      ...opts,
      describeError: (status, body) => {
        const b = (body ?? {}) as XError;
        const message = b.detail || b.errors?.[0]?.message || b.errors?.[0]?.detail || b.title;
        // 403 is a policy rejection (duplicate post, suspended account, plan limits): retrying won't help.
        return { message, code: b.type ? `x_${b.type.split('/').pop()}` : `x_${status}` };
      },
    });
    this.maxWaitMs = opts.maxWaitMs ?? 4 * 60_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  capabilities(account: Pick<AccountRef, 'scopes'>): Capabilities {
    const has = (s: string) => account.scopes.includes(s);
    const missing: string[] = [];
    if (!has('tweet.write')) missing.push('tweet.write (publishing)');
    if (!has('media.write')) missing.push('media.write (images and videos)');
    if (!has('tweet.read')) missing.push('tweet.read (analytics)');
    return {
      formats: has('media.write') ? ['TEXT', 'FEED', 'VIDEO'] : ['TEXT'],
      publish: has('tweet.write') && has('users.read'),
      analytics: has('tweet.read') && has('users.read'),
      // Reading replies needs search access beyond the basic API tiers.
      comments: false,
      replyToComments: false,
      firstComment: has('tweet.write'),
      directMessages: false,
      missing,
    };
  }

  private category(m: PublishMedia) {
    if (m.kind === 'VIDEO') return 'tweet_video';
    return m.mimeType === 'image/gif' ? 'tweet_gif' : 'tweet_image';
  }

  /** Chunked upload: initialize → append segments → finalize → wait for processing. */
  private async upload(m: PublishMedia, token: string): Promise<string> {
    const init = await this.http.request<{ data: { id: string } }>({
      method: 'POST',
      url: `${API}/media/upload/initialize`,
      token,
      json: { media_type: m.mimeType, total_bytes: m.sizeBytes, media_category: this.category(m) },
    });
    const id = init.data.data.id;
    for (let i = 0, start = 0; start < m.sizeBytes; i++, start += CHUNK) {
      const form = new FormData();
      form.append('segment_index', String(i));
      form.append('media', new Blob([new Uint8Array(await m.read(start, Math.min(start + CHUNK, m.sizeBytes)))]), 'chunk');
      await this.http.request({ method: 'POST', url: `${API}/media/upload/${id}/append`, token, body: form, timeoutMs: 120_000 });
    }
    const fin = await this.http.request<{ data: { processing_info?: { state: string; check_after_secs?: number } } }>({
      method: 'POST',
      url: `${API}/media/upload/${id}/finalize`,
      token,
    });
    let info = fin.data.data?.processing_info;
    const deadline = Date.now() + this.maxWaitMs;
    while (info && info.state !== 'succeeded') {
      if (info.state === 'failed') throw new AdapterError('permanent', 'X could not process this media file.', 'x_media_failed');
      if (Date.now() >= deadline) throw new AdapterError('transient', 'X is still processing the video.', 'x_processing', 120);
      await this.sleep(Math.max(1, info.check_after_secs ?? 5) * 1000);
      const st = await this.http.request<{ data: { processing_info?: { state: string; check_after_secs?: number } } }>({
        method: 'GET',
        url: `${API}/media/upload`,
        token,
        query: { command: 'STATUS', media_id: id },
      });
      info = st.data.data?.processing_info;
    }
    return id;
  }

  async publish(input: PublishInput, hooks: PublishHooks): Promise<PublishResult> {
    const token = input.account.accessToken;
    const state: XState = { ...((input.providerState ?? {}) as XState) };
    const uploaded: Record<string, { id: string; at: string }> = { ...(state.media ?? {}) };
    const ids: string[] = [];
    for (const m of input.media) {
      const prev = uploaded[m.id];
      if (prev && Date.now() - Date.parse(prev.at) < MEDIA_REUSE_MS) {
        ids.push(prev.id);
        continue;
      }
      const id = await this.upload(m, token);
      uploaded[m.id] = { id, at: new Date().toISOString() };
      await hooks.saveState({ media: uploaded });
      ids.push(id);
    }
    const text = xText(input.caption, input.linkUrl);
    await hooks.beforeFinalCall();
    const res = await this.http.request<{ data: { id: string } }>({
      method: 'POST',
      url: `${API}/tweets`,
      token,
      json: { text: text || undefined, ...(ids.length ? { media: { media_ids: ids } } : {}) },
      finalCall: true,
    });
    const id = res.data.data.id;
    const username = (input.account.metadata.username as string | undefined) ?? 'i/web';
    return { externalId: id, externalUrl: `https://x.com/${username}/status/${id}` };
  }

  /** Looks for the post on the account's timeline since the attempt started. */
  async verifyPublish(input: PublishInput, since: Date): Promise<VerifyOutcome> {
    try {
      const res = await this.http.request<{ data?: { id: string; text: string }[] }>({
        method: 'GET',
        url: `${API}/users/${input.account.externalId}/tweets`,
        token: input.account.accessToken,
        query: { max_results: 10, start_time: since.toISOString(), 'tweet.fields': 'created_at' },
      });
      const want = xText(input.caption, input.linkUrl).trim();
      // X rewrites links to t.co, so compare the text before the first link.
      const head = want.split(/https?:\/\//)[0]!.trim();
      const match = (res.data.data ?? []).find((t) => (head ? t.text.startsWith(head) : true));
      if (match) {
        const username = (input.account.metadata.username as string | undefined) ?? 'i/web';
        return { status: 'published', externalId: match.id, externalUrl: `https://x.com/${username}/status/${match.id}` };
      }
      return res.data.data ? { status: 'not_published' } : { status: 'unknown' };
    } catch {
      // Timeline reads aren't available on every API plan; leave it to a person.
      return { status: 'unknown' };
    }
  }

  async checkHealth(account: AccountRef) {
    try {
      await this.http.request({ method: 'GET', url: `${API}/users/me`, token: account.accessToken });
      return { ok: true as const };
    } catch (err) {
      const e = err instanceof AdapterError ? err : new AdapterError('transient', String(err));
      return { ok: false as const, kind: e.kind, message: e.message };
    }
  }

  async fetchAccountMetrics(account: AccountRef) {
    const res = await this.http.request<{ data: { public_metrics?: { followers_count?: number } } }>({
      method: 'GET',
      url: `${API}/users/me`,
      token: account.accessToken,
      query: { 'user.fields': 'public_metrics' },
    });
    const today = new Date().toISOString().slice(0, 10);
    return [{ date: today, followers: res.data.data.public_metrics?.followers_count ?? null, impressions: null, reach: null, engagements: null, profileViews: null }];
  }

  async fetchPostMetrics(account: AccountRef, externalId: string) {
    const res = await this.http.request<{
      data: { public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number; quote_count?: number; bookmark_count?: number; impression_count?: number } };
    }>({ method: 'GET', url: `${API}/tweets/${externalId}`, token: account.accessToken, query: { 'tweet.fields': 'public_metrics' } });
    const m = res.data.data.public_metrics ?? {};
    const shares = m.retweet_count != null || m.quote_count != null ? (m.retweet_count ?? 0) + (m.quote_count ?? 0) : null;
    return {
      likes: m.like_count ?? null,
      comments: m.reply_count ?? null,
      shares,
      saves: m.bookmark_count ?? null,
      reach: null,
      impressions: m.impression_count ?? null,
      videoViews: null,
    };
  }

  async listComments(): Promise<never> {
    throw new AdapterError('permanent', 'Reading replies on X needs a higher API access level; it is not supported yet.', 'unsupported');
  }

  async replyToComment(account: AccountRef, commentExternalId: string, text: string) {
    return this.postComment(account, commentExternalId, text);
  }

  /** The "first comment" on X is a reply to the post. */
  async postComment(account: AccountRef, externalPostId: string, text: string) {
    const res = await this.http.request<{ data: { id: string } }>({
      method: 'POST',
      url: `${API}/tweets`,
      token: account.accessToken,
      json: { text, reply: { in_reply_to_tweet_id: externalPostId } },
      finalCall: true,
    });
    return { externalId: res.data.data.id };
  }
}
