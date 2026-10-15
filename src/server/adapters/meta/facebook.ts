import { AdapterError, type AccountRef, type Capabilities, type PublishHooks, type PublishInput, type PublishResult, type SocialAdapter, type VerifyOutcome } from '../types';
import type { GraphClient } from './graph';

const REQUIRED_PUBLISH = ['pages_manage_posts'];

interface PhotoResponse {
  id: string;
  post_id?: string;
}

/** Facebook Pages via the Graph API (personal profiles cannot be published to). */
export class FacebookAdapter implements SocialAdapter {
  readonly platform = 'FACEBOOK' as const;

  constructor(private readonly graph: GraphClient) {}

  capabilities(account: Pick<AccountRef, 'scopes'>): Capabilities {
    const has = (s: string) => account.scopes.includes(s);
    const missing: string[] = [];
    for (const s of REQUIRED_PUBLISH) if (!has(s)) missing.push(`${s} (publishing)`);
    if (!has('read_insights')) missing.push('read_insights (analytics)');
    if (!has('pages_read_user_content')) missing.push('pages_read_user_content (reading comments)');
    if (!has('pages_manage_engagement')) missing.push('pages_manage_engagement (replying to comments)');
    return {
      formats: ['TEXT', 'LINK', 'FEED', 'REEL'],
      publish: REQUIRED_PUBLISH.every(has),
      analytics: has('read_insights'),
      comments: has('pages_read_user_content') || has('pages_read_engagement'),
      replyToComments: has('pages_manage_engagement'),
      // Page messaging requires separate Messenger permissions and review; not supported yet.
      directMessages: false,
      missing,
    };
  }

  private postUrl(id: string) {
    return `https://www.facebook.com/${id}`;
  }

  async publish(input: PublishInput, hooks: PublishHooks): Promise<PublishResult> {
    const { account, media, caption, linkUrl } = input;
    const pageId = account.externalId;
    const token = account.accessToken;
    const message = linkUrl && media.length > 0 && !caption.includes(linkUrl) ? `${caption}\n\n${linkUrl}`.trim() : caption;

    if (media.length === 0) {
      await hooks.beforeFinalCall();
      const res = await this.graph.post<{ id: string }>(`${pageId}/feed`, token, { message: message || undefined, link: linkUrl ?? undefined }, true);
      return { externalId: res.id, externalUrl: this.postUrl(res.id) };
    }

    const video = media.find((m) => m.kind === 'VIDEO');
    if (video) {
      await hooks.beforeFinalCall();
      const res = await this.graph.post<{ id: string }>(`${pageId}/videos`, token, { file_url: video.url, description: message || undefined, published: true }, true);
      return { externalId: res.id, externalUrl: `https://www.facebook.com/${pageId}/videos/${res.id}` };
    }

    if (media.length === 1) {
      await hooks.beforeFinalCall();
      const res = await this.graph.post<PhotoResponse>(`${pageId}/photos`, token, { url: media[0]!.url, caption: message || undefined, published: true }, true);
      const id = res.post_id ?? res.id;
      return { externalId: id, externalUrl: this.postUrl(id) };
    }

    // Multi-photo: upload each photo unpublished (safe to repeat), then one feed post attaches them.
    const state = (input.providerState ?? {}) as { photoIds?: Record<string, string> };
    const photoIds: Record<string, string> = { ...(state.photoIds ?? {}) };
    for (const m of media) {
      if (photoIds[m.id]) continue;
      const res = await this.graph.post<PhotoResponse>(`${pageId}/photos`, token, { url: m.url, published: false, temporary: false });
      photoIds[m.id] = res.id;
      await hooks.saveState({ photoIds });
    }
    const attached: Record<string, string> = {};
    media.forEach((m, i) => {
      attached[`attached_media[${i}]`] = JSON.stringify({ media_fbid: photoIds[m.id] });
    });
    await hooks.beforeFinalCall();
    const res = await this.graph.post<{ id: string }>(`${pageId}/feed`, token, { message: message || undefined, ...attached }, true);
    return { externalId: res.id, externalUrl: this.postUrl(res.id) };
  }

  /** Looks for a Page post created after `since` with the same message. */
  async verifyPublish(input: PublishInput, since: Date): Promise<VerifyOutcome> {
    const text = input.caption.trim();
    if (!text) return { status: 'unknown' };
    const res = await this.graph.get<{ data: { id: string; message?: string; created_time: string }[] }>(`${input.account.externalId}/posts`, input.account.accessToken, {
      fields: 'id,message,created_time',
      since: Math.floor(since.getTime() / 1000) - 120,
      limit: 25,
    });
    const match = res.data.find((p) => (p.message ?? '').trim().startsWith(text.slice(0, 200)));
    return match ? { status: 'published', externalId: match.id, externalUrl: this.postUrl(match.id) } : { status: 'unknown' };
  }

  async checkHealth(account: AccountRef) {
    try {
      await this.graph.get(`${account.externalId}`, account.accessToken, { fields: 'id,name' });
      return { ok: true as const };
    } catch (err) {
      const e = err instanceof AdapterError ? err : new AdapterError('transient', String(err));
      return { ok: false as const, kind: e.kind, message: e.message };
    }
  }

  async fetchAccountMetrics(account: AccountRef, since: Date, until: Date) {
    const page = await this.graph.get<{ followers_count?: number; fan_count?: number }>(account.externalId, account.accessToken, { fields: 'followers_count,fan_count' });
    const followers = page.followers_count ?? page.fan_count ?? null;
    const byDate = new Map<string, { impressions: number | null; reach: number | null; engagements: number | null; profileViews: number | null }>();
    if (account.scopes.includes('read_insights')) {
      try {
        const res = await this.graph.get<{ data: { name: string; values: { value: number; end_time: string }[] }[] }>(`${account.externalId}/insights`, account.accessToken, {
          metric: 'page_impressions,page_impressions_unique,page_post_engagements,page_views_total',
          period: 'day',
          since: Math.floor(since.getTime() / 1000),
          until: Math.floor(until.getTime() / 1000),
        });
        for (const series of res.data) {
          for (const v of series.values) {
            const date = v.end_time.slice(0, 10);
            const row = byDate.get(date) ?? { impressions: null, reach: null, engagements: null, profileViews: null };
            if (series.name === 'page_impressions') row.impressions = v.value;
            if (series.name === 'page_impressions_unique') row.reach = v.value;
            if (series.name === 'page_post_engagements') row.engagements = v.value;
            if (series.name === 'page_views_total') row.profileViews = v.value;
            byDate.set(date, row);
          }
        }
      } catch (err) {
        // Some metrics are deprecated over time; keep the follower count we already have.
        if (err instanceof AdapterError && err.kind === 'auth') throw err;
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    if (!byDate.has(today)) byDate.set(today, { impressions: null, reach: null, engagements: null, profileViews: null });
    return [...byDate.entries()].map(([date, m]) => ({ date, followers: date === today ? followers : null, ...m }));
  }

  async fetchPostMetrics(account: AccountRef, externalId: string) {
    const res = await this.graph.get<{
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    }>(externalId, account.accessToken, { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares' });
    let impressions: number | null = null;
    let reach: number | null = null;
    if (account.scopes.includes('read_insights')) {
      try {
        const ins = await this.graph.get<{ data: { name: string; values: { value: number }[] }[] }>(`${externalId}/insights`, account.accessToken, {
          metric: 'post_impressions,post_impressions_unique',
        });
        impressions = ins.data.find((d) => d.name === 'post_impressions')?.values[0]?.value ?? null;
        reach = ins.data.find((d) => d.name === 'post_impressions_unique')?.values[0]?.value ?? null;
      } catch {
        /* insights unavailable for this post type */
      }
    }
    return {
      likes: res.reactions?.summary?.total_count ?? null,
      comments: res.comments?.summary?.total_count ?? null,
      shares: res.shares?.count ?? 0,
      saves: null,
      reach,
      impressions,
      videoViews: null,
    };
  }

  async listComments(account: AccountRef, externalPostId: string) {
    const res = await this.graph.get<{ data: { id: string; message?: string; created_time: string; from?: { id: string; name: string }; parent?: { id: string } }[] }>(
      `${externalPostId}/comments`,
      account.accessToken,
      { fields: 'id,message,created_time,from,parent', filter: 'stream', order: 'reverse_chronological', limit: 100 },
    );
    return res.data.map((c) => ({
      externalId: c.id,
      parentExternalId: c.parent?.id ?? null,
      authorName: c.from?.name ?? 'Facebook user',
      authorHandle: null,
      body: c.message ?? '',
      postedAt: c.created_time,
      isOwn: c.from?.id === account.externalId,
    }));
  }

  async replyToComment(account: AccountRef, commentExternalId: string, text: string) {
    const res = await this.graph.post<{ id: string }>(`${commentExternalId}/comments`, account.accessToken, { message: text }, true);
    return { externalId: res.id };
  }
}
