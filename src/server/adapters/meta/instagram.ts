import { AdapterError, type AccountRef, type Capabilities, type PublishHooks, type PublishInput, type PublishMedia, type PublishResult, type SocialAdapter, type VerifyOutcome } from '../types';
import type { GraphClient } from './graph';

const REQUIRED_PUBLISH = ['instagram_basic', 'instagram_content_publish'];
const CONTAINER_TTL_MS = 23 * 60 * 60 * 1000;
const round = (n: number) => Math.round(n * 1000) / 1000;

type ContainerStatus = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';

interface IgState {
  containerId?: string;
  containerCreatedAt?: string;
  children?: Record<string, string>;
}

export interface InstagramAdapterOptions {
  /** How long to wait for video processing within one attempt before deferring. */
  maxWaitMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Instagram professional accounts via the Instagram Graph API content publishing flow. */
export class InstagramAdapter implements SocialAdapter {
  readonly platform = 'INSTAGRAM' as const;
  private readonly maxWaitMs: number;
  private readonly pollMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly graph: GraphClient,
    opts: InstagramAdapterOptions = {},
  ) {
    this.maxWaitMs = opts.maxWaitMs ?? 4 * 60_000;
    this.pollMs = opts.pollIntervalMs ?? 5_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  capabilities(account: Pick<AccountRef, 'scopes'>): Capabilities {
    const has = (s: string) => account.scopes.includes(s);
    const missing: string[] = [];
    for (const s of REQUIRED_PUBLISH) if (!has(s)) missing.push(`${s} (publishing)`);
    if (!has('instagram_manage_insights')) missing.push('instagram_manage_insights (analytics)');
    if (!has('instagram_manage_comments')) missing.push('instagram_manage_comments (comments)');
    return {
      formats: ['FEED', 'CAROUSEL', 'REEL', 'STORY'],
      publish: REQUIRED_PUBLISH.every(has),
      analytics: has('instagram_manage_insights'),
      comments: has('instagram_manage_comments'),
      replyToComments: has('instagram_manage_comments'),
      firstComment: has('instagram_manage_comments'),
      // Instagram messaging needs the Messenger API for Instagram and separate review.
      directMessages: false,
      missing,
    };
  }

  private async status(id: string, token: string) {
    const res = await this.graph.get<{ status_code: ContainerStatus; status?: string }>(id, token, { fields: 'status_code,status' });
    return res;
  }

  /** Polls a container until it is ready. Throws transient if processing takes longer than this attempt allows. */
  private async waitReady(id: string, token: string) {
    const deadline = Date.now() + this.maxWaitMs;
    for (;;) {
      const s = await this.status(id, token);
      if (s.status_code === 'FINISHED' || s.status_code === 'PUBLISHED') return s.status_code;
      if (s.status_code === 'ERROR') throw new AdapterError('permanent', `Instagram could not process the media${s.status ? `: ${s.status}` : '.'}`, 'ig_container_error');
      if (s.status_code === 'EXPIRED') throw new AdapterError('transient', 'The Instagram upload expired; it will be recreated.', 'ig_container_expired');
      if (Date.now() >= deadline) throw new AdapterError('transient', 'Instagram is still processing the video.', 'ig_processing', 120);
      await this.sleep(this.pollMs);
    }
  }

  /**
   * Container parameters for one item. Collaborators and tagged people are sent as JSON arrays;
   * on a carousel, collaborators go on the parent and tags on each photo.
   */
  private mediaParams(m: PublishMedia, input: PublishInput, opts: { carouselItem: boolean; caption?: string }) {
    const o = input.options;
    const firstId = input.media[0]?.id;
    const tags = o.userTags.filter((t) => (t.mediaId ?? firstId) === m.id);
    const collaborators = !opts.carouselItem && o.collaborators.length ? JSON.stringify(o.collaborators) : undefined;
    if (input.format === 'STORY') {
      return m.kind === 'VIDEO' ? { media_type: 'STORIES', video_url: m.url } : { media_type: 'STORIES', image_url: m.url };
    }
    if (m.kind === 'VIDEO') {
      if (opts.carouselItem) return { media_type: 'VIDEO', video_url: m.url, is_carousel_item: true };
      return {
        media_type: 'REELS',
        video_url: m.url,
        caption: opts.caption,
        share_to_feed: o.shareToFeed,
        thumb_offset: o.coverOffsetSec != null ? Math.round(o.coverOffsetSec * 1000) : undefined,
        collaborators,
        // Reels take tagged usernames without a position.
        user_tags: tags.length ? JSON.stringify(tags.map((t) => ({ username: t.username }))) : undefined,
      };
    }
    return {
      image_url: m.url,
      is_carousel_item: opts.carouselItem || undefined,
      caption: opts.caption,
      collaborators,
      user_tags: tags.length ? JSON.stringify(tags.map((t) => ({ username: t.username, x: round(t.x), y: round(t.y) }))) : undefined,
    };
  }

  private async ensureQuota(account: AccountRef) {
    try {
      const res = await this.graph.get<{ data: { quota_usage: number; config?: { quota_total: number } }[] }>(`${account.externalId}/content_publishing_limit`, account.accessToken, {
        fields: 'quota_usage,config',
      });
      const row = res.data[0];
      if (row?.config && row.quota_usage >= row.config.quota_total) {
        throw new AdapterError('transient', 'Instagram’s 24-hour publishing limit for this account has been reached.', 'ig_quota', 60 * 60);
      }
    } catch (err) {
      if (err instanceof AdapterError && (err.code === 'ig_quota' || err.kind === 'auth')) throw err;
      // The limit endpoint is advisory; continue if it fails.
    }
  }

  async publish(input: PublishInput, hooks: PublishHooks): Promise<PublishResult> {
    const { account, media, caption } = input;
    const token = account.accessToken;
    if (media.length === 0) throw new AdapterError('permanent', 'Instagram posts need at least one image or video.', 'ig_no_media');
    if (input.format === 'STORY' && media.length !== 1) throw new AdapterError('permanent', 'An Instagram Story needs exactly one image or video.', 'ig_story_media');
    await this.ensureQuota(account);

    const state: IgState = { ...((input.providerState ?? {}) as IgState) };
    const fresh = state.containerId && state.containerCreatedAt && Date.now() - Date.parse(state.containerCreatedAt) < CONTAINER_TTL_MS;
    let containerId = fresh ? state.containerId! : undefined;

    if (containerId) {
      // Resume: if an earlier attempt already published this container, don't publish again.
      const s = await this.status(containerId, token).catch(() => null);
      if (s?.status_code === 'PUBLISHED') {
        const found = await this.findRecent(input, new Date(Date.parse(state.containerCreatedAt!) - 60_000));
        if (found) return found;
        throw new AdapterError('ambiguous', 'Instagram reports this post as published but it could not be found.', 'ig_published_unmatched');
      }
      if (!s || s.status_code === 'ERROR' || s.status_code === 'EXPIRED') containerId = undefined;
    }

    if (!containerId) {
      if (media.length === 1) {
        const res = await this.graph.post<{ id: string }>(`${account.externalId}/media`, token, this.mediaParams(media[0]!, input, { carouselItem: false, caption }));
        containerId = res.id;
      } else {
        const children: Record<string, string> = { ...(fresh ? (state.children ?? {}) : {}) };
        for (const m of media) {
          if (children[m.id]) continue;
          const res = await this.graph.post<{ id: string }>(`${account.externalId}/media`, token, this.mediaParams(m, input, { carouselItem: true }));
          children[m.id] = res.id;
          await hooks.saveState({ children, containerCreatedAt: new Date().toISOString() });
        }
        for (const id of Object.values(children)) await this.waitReady(id, token);
        const res = await this.graph.post<{ id: string }>(`${account.externalId}/media`, token, {
          media_type: 'CAROUSEL',
          children: media.map((m) => children[m.id]).join(','),
          caption,
          collaborators: input.options.collaborators.length ? JSON.stringify(input.options.collaborators) : undefined,
        });
        containerId = res.id;
        state.children = children;
      }
      state.containerId = containerId;
      state.containerCreatedAt = new Date().toISOString();
      await hooks.saveState({ ...state });
    }

    await this.waitReady(containerId, token);
    await hooks.beforeFinalCall();
    const published = await this.graph.post<{ id: string }>(`${account.externalId}/media_publish`, token, { creation_id: containerId }, true);
    let permalink: string | null = null;
    try {
      permalink = (await this.graph.get<{ permalink?: string }>(published.id, token, { fields: 'permalink' })).permalink ?? null;
    } catch {
      /* the post is live; the link is a nice-to-have */
    }
    return { externalId: published.id, externalUrl: permalink };
  }

  /** Finds a just-published post: by caption on the profile grid, or the newest Story. */
  private async findRecent(input: PublishInput, since: Date) {
    const { account } = input;
    if (input.format === 'STORY') {
      const res = await this.graph.get<{ data: { id: string; timestamp?: string; permalink?: string }[] }>(`${account.externalId}/stories`, account.accessToken, {
        fields: 'id,timestamp,permalink',
      });
      const match = res.data.find((m) => m.timestamp && Date.parse(m.timestamp) >= since.getTime());
      return match ? { externalId: match.id, externalUrl: match.permalink ?? null } : null;
    }
    const res = await this.graph.get<{ data: { id: string; caption?: string; timestamp: string; permalink?: string }[] }>(`${account.externalId}/media`, account.accessToken, {
      fields: 'id,caption,timestamp,permalink',
      limit: 15,
    });
    const match = res.data.find((m) => Date.parse(m.timestamp) >= since.getTime() && (m.caption ?? '').trim() === input.caption.trim());
    return match ? { externalId: match.id, externalUrl: match.permalink ?? null } : null;
  }

  /** The container's status tells us definitively whether media_publish went through. */
  async verifyPublish(input: PublishInput, since: Date): Promise<VerifyOutcome> {
    const state = (input.providerState ?? {}) as IgState;
    if (!state.containerId) return { status: 'not_published' };
    const s = await this.status(state.containerId, input.account.accessToken);
    if (s.status_code === 'PUBLISHED') {
      const found = await this.findRecent(input, since);
      return found ? { status: 'published', ...found } : { status: 'unknown' };
    }
    if (s.status_code === 'FINISHED' || s.status_code === 'EXPIRED' || s.status_code === 'ERROR') return { status: 'not_published' };
    return { status: 'unknown' };
  }

  async checkHealth(account: AccountRef) {
    try {
      await this.graph.get(account.externalId, account.accessToken, { fields: 'id,username' });
      return { ok: true as const };
    } catch (err) {
      const e = err instanceof AdapterError ? err : new AdapterError('transient', String(err));
      return { ok: false as const, kind: e.kind, message: e.message };
    }
  }

  async fetchAccountMetrics(account: AccountRef, since: Date, until: Date) {
    const profile = await this.graph.get<{ followers_count?: number }>(account.externalId, account.accessToken, { fields: 'followers_count' });
    const byDate = new Map<string, { impressions: number | null; reach: number | null; engagements: number | null; profileViews: number | null }>();
    if (account.scopes.includes('instagram_manage_insights')) {
      try {
        const res = await this.graph.get<{ data: { name: string; values: { value: number; end_time: string }[] }[] }>(`${account.externalId}/insights`, account.accessToken, {
          metric: 'reach',
          period: 'day',
          since: Math.floor(since.getTime() / 1000),
          until: Math.floor(until.getTime() / 1000),
        });
        for (const series of res.data) {
          for (const v of series.values) {
            const date = v.end_time.slice(0, 10);
            const row = byDate.get(date) ?? { impressions: null, reach: null, engagements: null, profileViews: null };
            if (series.name === 'reach') row.reach = v.value;
            byDate.set(date, row);
          }
        }
      } catch (err) {
        if (err instanceof AdapterError && err.kind === 'auth') throw err;
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    if (!byDate.has(today)) byDate.set(today, { impressions: null, reach: null, engagements: null, profileViews: null });
    return [...byDate.entries()].map(([date, m]) => ({ date, followers: date === today ? (profile.followers_count ?? null) : null, ...m }));
  }

  async fetchPostMetrics(account: AccountRef, externalId: string) {
    const base = await this.graph.get<{ like_count?: number; comments_count?: number; media_product_type?: string }>(externalId, account.accessToken, {
      fields: 'like_count,comments_count,media_product_type',
    });
    let reach: number | null = null;
    let saves: number | null = null;
    let shares: number | null = null;
    let views: number | null = null;
    if (account.scopes.includes('instagram_manage_insights')) {
      try {
        const ins = await this.graph.get<{ data: { name: string; values: { value: number }[] }[] }>(`${externalId}/insights`, account.accessToken, { metric: 'reach,saved,shares,views' });
        const pick = (n: string) => ins.data.find((d) => d.name === n)?.values[0]?.value ?? null;
        reach = pick('reach');
        saves = pick('saved');
        shares = pick('shares');
        views = pick('views');
      } catch {
        /* metric set differs by media type; leave unavailable */
      }
    }
    return { likes: base.like_count ?? null, comments: base.comments_count ?? null, shares, saves, reach, impressions: null, videoViews: views };
  }

  async listComments(account: AccountRef, externalPostId: string) {
    const res = await this.graph.get<{ data: { id: string; text?: string; timestamp: string; username?: string; from?: { id: string; username?: string }; replies?: { data: { id: string }[] } }[] }>(
      `${externalPostId}/comments`,
      account.accessToken,
      { fields: 'id,text,timestamp,username,from', limit: 100 },
    );
    return res.data.map((c) => ({
      externalId: c.id,
      parentExternalId: null,
      authorName: c.username ?? c.from?.username ?? 'Instagram user',
      authorHandle: c.username ?? c.from?.username ?? null,
      body: c.text ?? '',
      postedAt: c.timestamp,
      isOwn: c.from?.id === account.externalId,
    }));
  }

  async postComment(account: AccountRef, externalPostId: string, text: string) {
    const res = await this.graph.post<{ id: string }>(`${externalPostId}/comments`, account.accessToken, { message: text }, true);
    return { externalId: res.id };
  }

  async replyToComment(account: AccountRef, commentExternalId: string, text: string) {
    const res = await this.graph.post<{ id: string }>(`${commentExternalId}/replies`, account.accessToken, { message: text }, true);
    return { externalId: res.id };
  }
}
