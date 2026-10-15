import { isShort } from '@/lib/platforms';
import { youtubeTitle } from '@/lib/post-options';
import { HttpClient, type HttpClientConfig } from './http';
import { AdapterError, type AccountRef, type Capabilities, type PublishHooks, type PublishInput, type PublishResult, type RemoteComment, type SocialAdapter, type VerifyOutcome } from './types';

const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
/** Resumable chunks must be multiples of 256 KiB. */
const CHUNK = 32 * 256 * 1024;
/** Upload sessions stay valid for about a week; restart well before that. */
const SESSION_TTL_MS = 5 * 24 * 3600_000;

const SCOPE = {
  upload: 'https://www.googleapis.com/auth/youtube.upload',
  readonly: 'https://www.googleapis.com/auth/youtube.readonly',
  forceSsl: 'https://www.googleapis.com/auth/youtube.force-ssl',
};

interface YtState {
  uploadUrl?: string;
  startedAt?: string;
  mediaId?: string;
  videoId?: string;
}

interface YtError {
  error?: { code?: number; message?: string; errors?: { reason?: string; message?: string }[] };
}

const QUOTA_REASONS = new Set(['quotaExceeded', 'uploadLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded']);
const AUTH_REASONS = new Set(['insufficientPermissions', 'forbidden', 'authError', 'youtubeSignupRequired']);

/** Strips the characters YouTube rejects in titles and descriptions. */
const clean = (s: string) => s.replace(/[<>]/g, '');

const watchUrl = (id: string, short: boolean) => (short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);

/** YouTube channels through the Data API v3 (resumable uploads; Shorts are vertical videos ≤ 3 min). */
export class YouTubeAdapter implements SocialAdapter {
  readonly platform = 'YOUTUBE' as const;
  private readonly http: HttpClient;

  constructor(opts: HttpClientConfig = {}) {
    this.http = new HttpClient('YouTube', {
      ...opts,
      describeError: (status, body) => {
        const e = (body as YtError | null)?.error;
        const reason = e?.errors?.[0]?.reason;
        const code = reason ? `yt_${reason}` : `yt_${status}`;
        if (reason && QUOTA_REASONS.has(reason)) {
          // Daily quota resets at midnight Pacific time; try again in a few hours.
          return { message: e?.message ?? 'YouTube API quota reached.', code, kind: 'transient', retryAfterSec: 3 * 3600 };
        }
        if (reason && AUTH_REASONS.has(reason)) return { message: e?.message, code, kind: 'auth' };
        return { message: e?.message, code };
      },
    });
  }

  capabilities(account: { scopes: string[] }): Capabilities {
    const has = (s: string) => account.scopes.includes(s);
    const missing: string[] = [];
    if (!has(SCOPE.upload)) missing.push('youtube.upload (publishing)');
    if (!has(SCOPE.readonly) && !has(SCOPE.forceSsl)) missing.push('youtube.readonly (analytics)');
    if (!has(SCOPE.forceSsl)) missing.push('youtube.force-ssl (comments)');
    return {
      formats: ['VIDEO', 'SHORT'],
      publish: has(SCOPE.upload),
      analytics: has(SCOPE.readonly) || has(SCOPE.forceSsl),
      comments: has(SCOPE.forceSsl),
      replyToComments: has(SCOPE.forceSsl),
      firstComment: has(SCOPE.forceSsl),
      directMessages: false,
      missing,
    };
  }

  private metadata(input: PublishInput) {
    const o = input.options;
    const description = clean(input.linkUrl && !input.caption.includes(input.linkUrl) ? `${input.caption}\n\n${input.linkUrl}`.trim() : input.caption);
    return {
      snippet: { title: youtubeTitle(input.caption, o), description, tags: o.ytTags.length ? o.ytTags : undefined, categoryId: '22' },
      status: { privacyStatus: o.ytPrivacy, selfDeclaredMadeForKids: o.ytMadeForKids, embeddable: true },
    };
  }

  /** Asks the upload session how far it got. Returns the video id once the upload is complete. */
  private async progress(uploadUrl: string, total: number, token: string): Promise<{ next: number } | { videoId: string } | 'expired'> {
    try {
      const res = await this.http.request<{ id?: string }>({
        method: 'PUT',
        url: uploadUrl,
        token,
        headers: { 'Content-Range': `bytes */${total}` },
        okStatuses: [308],
      });
      if (res.status === 308) {
        const range = res.headers.get('range');
        return { next: range ? Number(range.split('-')[1]) + 1 : 0 };
      }
      return res.data.id ? { videoId: res.data.id } : { next: 0 };
    } catch (err) {
      if (err instanceof AdapterError && (err.raw as { status?: number })?.status === 404) return 'expired';
      throw err;
    }
  }

  async publish(input: PublishInput, hooks: PublishHooks): Promise<PublishResult> {
    const token = input.account.accessToken;
    const video = input.media[0];
    if (!video || video.kind !== 'VIDEO' || input.media.length !== 1) throw new AdapterError('permanent', 'YouTube needs exactly one video.', 'yt_no_video');
    const short = isShort({ ...video, sizeBytes: video.sizeBytes });
    const state: YtState = { ...((input.providerState ?? {}) as YtState) };
    if (state.videoId) return { externalId: state.videoId, externalUrl: watchUrl(state.videoId, short) };

    let uploadUrl = state.mediaId === video.id && state.uploadUrl && Date.now() - Date.parse(state.startedAt ?? '') < SESSION_TTL_MS ? state.uploadUrl : undefined;
    let offset = 0;
    if (uploadUrl) {
      const p = await this.progress(uploadUrl, video.sizeBytes, token);
      if (p === 'expired') uploadUrl = undefined;
      else if ('videoId' in p) {
        await hooks.saveState({ ...state, videoId: p.videoId });
        return { externalId: p.videoId, externalUrl: watchUrl(p.videoId, short) };
      } else offset = p.next;
    }
    if (!uploadUrl) {
      const init = await this.http.request({
        method: 'POST',
        url: UPLOAD,
        query: { uploadType: 'resumable', part: 'snippet,status' },
        token,
        headers: { 'X-Upload-Content-Length': String(video.sizeBytes), 'X-Upload-Content-Type': video.mimeType },
        json: this.metadata(input),
      });
      uploadUrl = init.headers.get('location') ?? undefined;
      if (!uploadUrl) throw new AdapterError('transient', 'YouTube did not start the upload.', 'yt_no_session');
      Object.assign(state, { uploadUrl, startedAt: new Date().toISOString(), mediaId: video.id, videoId: undefined });
      await hooks.saveState({ ...state });
      offset = 0;
    }

    // The video only exists once the last byte arrives, so that chunk is the final call.
    while (offset < video.sizeBytes) {
      const end = Math.min(offset + CHUNK, video.sizeBytes);
      const last = end === video.sizeBytes;
      if (last) await hooks.beforeFinalCall();
      const res = await this.http.request<{ id?: string }>({
        method: 'PUT',
        url: uploadUrl,
        token,
        headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${video.sizeBytes}`, 'Content-Type': video.mimeType },
        body: new Uint8Array(await video.read(offset, end)),
        okStatuses: [308],
        finalCall: last,
        timeoutMs: 300_000,
      });
      if (res.status === 308) {
        const range = res.headers.get('range');
        offset = range ? Number(range.split('-')[1]) + 1 : end;
        continue;
      }
      if (!res.data.id) throw new AdapterError('ambiguous', 'YouTube finished the upload but did not return a video id.', 'yt_no_id');
      await hooks.saveState({ ...state, videoId: res.data.id });
      return { externalId: res.data.id, externalUrl: watchUrl(res.data.id, short) };
    }
    throw new AdapterError('ambiguous', 'The upload finished without a response from YouTube.', 'yt_no_id');
  }

  /** The upload session says definitively whether the video was created. */
  async verifyPublish(input: PublishInput): Promise<VerifyOutcome> {
    const state = (input.providerState ?? {}) as YtState;
    const video = input.media[0];
    const short = isShort(video ? { ...video } : undefined);
    if (state.videoId) return { status: 'published', externalId: state.videoId, externalUrl: watchUrl(state.videoId, short) };
    if (!state.uploadUrl || !video) return { status: 'not_published' };
    const p = await this.progress(state.uploadUrl, video.sizeBytes, input.account.accessToken);
    if (p === 'expired') return { status: 'not_published' };
    if ('videoId' in p) return { status: 'published', externalId: p.videoId, externalUrl: watchUrl(p.videoId, short) };
    return { status: 'not_published' };
  }

  async checkHealth(account: AccountRef) {
    try {
      await this.http.request({ method: 'GET', url: `${API}/channels`, token: account.accessToken, query: { part: 'id', mine: true } });
      return { ok: true as const };
    } catch (err) {
      const e = err instanceof AdapterError ? err : new AdapterError('transient', String(err));
      return { ok: false as const, kind: e.kind, message: e.message };
    }
  }

  async fetchAccountMetrics(account: AccountRef) {
    const res = await this.http.request<{ items?: { statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[] }>({
      method: 'GET',
      url: `${API}/channels`,
      token: account.accessToken,
      query: { part: 'statistics', id: account.externalId },
    });
    const st = res.data.items?.[0]?.statistics;
    const today = new Date().toISOString().slice(0, 10);
    const followers = st && !st.hiddenSubscriberCount && st.subscriberCount != null ? Number(st.subscriberCount) : null;
    return [{ date: today, followers, impressions: null, reach: null, engagements: null, profileViews: null }];
  }

  async fetchPostMetrics(account: AccountRef, externalId: string) {
    const res = await this.http.request<{ items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>({
      method: 'GET',
      url: `${API}/videos`,
      token: account.accessToken,
      query: { part: 'statistics', id: externalId },
    });
    const st = res.data.items?.[0]?.statistics ?? {};
    const n = (v?: string) => (v == null ? null : Number(v));
    return { likes: n(st.likeCount), comments: n(st.commentCount), shares: null, saves: null, reach: null, impressions: null, videoViews: n(st.viewCount) };
  }

  async listComments(account: AccountRef, externalPostId: string): Promise<RemoteComment[]> {
    const res = await this.http.request<{
      items?: { id: string; snippet: { topLevelComment: { id: string; snippet: { textOriginal?: string; authorDisplayName?: string; authorChannelId?: { value?: string }; publishedAt: string } } } }[];
    }>({ method: 'GET', url: `${API}/commentThreads`, token: account.accessToken, query: { part: 'snippet', videoId: externalPostId, maxResults: 50, order: 'time' } });
    return (res.data.items ?? []).map((t) => {
      const c = t.snippet.topLevelComment;
      return {
        externalId: c.id,
        parentExternalId: null,
        authorName: c.snippet.authorDisplayName ?? 'YouTube user',
        authorHandle: null,
        body: c.snippet.textOriginal ?? '',
        postedAt: c.snippet.publishedAt,
        isOwn: c.snippet.authorChannelId?.value === account.externalId,
      };
    });
  }

  async replyToComment(account: AccountRef, commentExternalId: string, text: string) {
    const res = await this.http.request<{ id: string }>({
      method: 'POST',
      url: `${API}/comments`,
      token: account.accessToken,
      query: { part: 'snippet' },
      json: { snippet: { parentId: commentExternalId, textOriginal: text } },
      finalCall: true,
    });
    return { externalId: res.data.id };
  }

  async postComment(account: AccountRef, externalPostId: string, text: string) {
    const res = await this.http.request<{ id: string }>({
      method: 'POST',
      url: `${API}/commentThreads`,
      token: account.accessToken,
      query: { part: 'snippet' },
      json: { snippet: { videoId: externalPostId, topLevelComment: { snippet: { textOriginal: text } } } },
      finalCall: true,
    });
    return { externalId: res.data.id };
  }
}
