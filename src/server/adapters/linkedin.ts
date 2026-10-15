import { HttpClient, type HttpClientConfig } from './http';
import { AdapterError, type AccountRef, type Capabilities, type PublishHooks, type PublishInput, type PublishMedia, type PublishResult, type SocialAdapter, type VerifyOutcome } from './types';

const REST = 'https://api.linkedin.com/rest';

interface LiState {
  images?: Record<string, string>;
  video?: { mediaId: string; urn: string; finalized: boolean };
}

interface LiError {
  message?: string;
  serviceErrorCode?: number;
  code?: string;
  status?: number;
}

/**
 * LinkedIn's post text ("little text") treats some characters as markup. Escapes them so the
 * text appears as written, and turns #hashtags into LinkedIn hashtags.
 */
export function toLittleText(text: string) {
  const escaped = text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
  return escaped.replace(/(^|\s)\\#([\p{L}\p{N}_]+)/gu, (_m, pre: string, tag: string) => `${pre}{hashtag|\\#|${tag}}`);
}

export interface LinkedInAdapterOptions extends HttpClientConfig {
  version?: string;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** LinkedIn member profiles and organization pages through the versioned REST Posts API. */
export class LinkedInAdapter implements SocialAdapter {
  readonly platform = 'LINKEDIN' as const;
  private readonly http: HttpClient;
  private readonly version: string;
  private readonly maxWaitMs: number;
  private readonly pollMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: LinkedInAdapterOptions = {}) {
    this.http = new HttpClient('LinkedIn', {
      ...opts,
      describeError: (status, body) => {
        const b = (body ?? {}) as LiError;
        // 403 means the token lacks a permission (or the member lost their page role).
        return { message: b.message, code: b.serviceErrorCode ? `li_${b.serviceErrorCode}` : `li_${status}`, kind: status === 403 ? 'auth' : undefined };
      },
    });
    this.version = opts.version ?? '202608';
    this.maxWaitMs = opts.maxWaitMs ?? 4 * 60_000;
    this.pollMs = opts.pollIntervalMs ?? 5_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private headers() {
    return { 'LinkedIn-Version': this.version, 'X-Restli-Protocol-Version': '2.0.0' };
  }

  /** The author URN: urn:li:person:… or urn:li:organization:… */
  private author(account: Pick<AccountRef, 'metadata' | 'externalId'>) {
    return (account.metadata.urn as string | undefined) ?? `urn:li:person:${account.externalId}`;
  }

  private isOrg(account: Pick<AccountRef, 'metadata' | 'externalId'>) {
    return this.author(account).startsWith('urn:li:organization:');
  }

  capabilities(account: { scopes: string[]; metadata?: unknown }): Capabilities {
    const has = (s: string) => account.scopes.includes(s);
    const urn = (account.metadata as { urn?: string } | null | undefined)?.urn ?? '';
    const org = urn.startsWith('urn:li:organization:');
    const write = org ? has('w_organization_social') : has('w_member_social');
    const read = org && has('r_organization_social');
    const missing: string[] = [];
    if (!write) missing.push(`${org ? 'w_organization_social' : 'w_member_social'} (publishing)`);
    if (org && !read) missing.push('r_organization_social (analytics)');
    if (!org) missing.push('Post analytics are only available for LinkedIn pages');
    return {
      formats: ['TEXT', 'LINK', 'FEED', 'VIDEO'],
      publish: write,
      analytics: read,
      comments: false,
      replyToComments: false,
      firstComment: write,
      directMessages: false,
      missing,
    };
  }

  private async uploadImage(m: PublishMedia, account: AccountRef): Promise<string> {
    const init = await this.http.request<{ value: { uploadUrl: string; image: string } }>({
      method: 'POST',
      url: `${REST}/images`,
      query: { action: 'initializeUpload' },
      token: account.accessToken,
      headers: this.headers(),
      json: { initializeUploadRequest: { owner: this.author(account) } },
    });
    await this.http.request({
      method: 'PUT',
      url: init.data.value.uploadUrl,
      token: account.accessToken,
      headers: { 'Content-Type': m.mimeType },
      body: new Uint8Array(await m.read(0, m.sizeBytes)),
      timeoutMs: 120_000,
    });
    return init.data.value.image;
  }

  private async uploadVideo(m: PublishMedia, account: AccountRef): Promise<string> {
    const init = await this.http.request<{ value: { video: string; uploadToken?: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } }>({
      method: 'POST',
      url: `${REST}/videos`,
      query: { action: 'initializeUpload' },
      token: account.accessToken,
      headers: this.headers(),
      json: { initializeUploadRequest: { owner: this.author(account), fileSizeBytes: m.sizeBytes, uploadCaptions: false, uploadThumbnail: false } },
    });
    const etags: string[] = [];
    for (const part of init.data.value.uploadInstructions) {
      const res = await this.http.request({
        method: 'PUT',
        url: part.uploadUrl,
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(await m.read(part.firstByte, part.lastByte + 1)),
        timeoutMs: 180_000,
      });
      etags.push(res.headers.get('etag') ?? '');
    }
    await this.http.request({
      method: 'POST',
      url: `${REST}/videos`,
      query: { action: 'finalizeUpload' },
      token: account.accessToken,
      headers: this.headers(),
      json: { finalizeUploadRequest: { video: init.data.value.video, uploadToken: init.data.value.uploadToken ?? '', uploadedPartIds: etags } },
    });
    return init.data.value.video;
  }

  private async waitVideo(urn: string, account: AccountRef) {
    const deadline = Date.now() + this.maxWaitMs;
    for (;;) {
      const res = await this.http.request<{ status?: string }>({ method: 'GET', url: `${REST}/videos/${encodeURIComponent(urn)}`, token: account.accessToken, headers: this.headers() });
      if (res.data.status === 'AVAILABLE') return;
      if (res.data.status === 'PROCESSING_FAILED') throw new AdapterError('permanent', 'LinkedIn could not process the video.', 'li_video_failed');
      if (Date.now() >= deadline) throw new AdapterError('transient', 'LinkedIn is still processing the video.', 'li_processing', 120);
      await this.sleep(this.pollMs);
    }
  }

  async publish(input: PublishInput, hooks: PublishHooks): Promise<PublishResult> {
    const { account, media } = input;
    const state: LiState = { ...((input.providerState ?? {}) as LiState) };
    let content: Record<string, unknown> | undefined;
    let text = input.caption;

    const video = media.find((m) => m.kind === 'VIDEO');
    if (video) {
      let v = state.video?.mediaId === video.id ? state.video : undefined;
      if (!v) {
        v = { mediaId: video.id, urn: await this.uploadVideo(video, account), finalized: true };
        state.video = v;
        await hooks.saveState({ ...state });
      }
      await this.waitVideo(v.urn, account);
      content = { media: { id: v.urn } };
    } else if (media.length > 0) {
      const images: Record<string, string> = { ...(state.images ?? {}) };
      for (const m of media) {
        if (images[m.id]) continue;
        images[m.id] = await this.uploadImage(m, account);
        state.images = images;
        await hooks.saveState({ ...state });
      }
      content = media.length === 1 ? { media: { id: images[media[0]!.id] } } : { multiImage: { images: media.map((m) => ({ id: images[m.id] })) } };
    } else if (input.linkUrl) {
      let host = input.linkUrl;
      try {
        host = new URL(input.linkUrl).hostname;
      } catch {
        /* validated earlier */
      }
      content = { article: { source: input.linkUrl, title: host } };
    }
    if (input.linkUrl && media.length > 0 && !text.includes(input.linkUrl)) text = `${text}\n\n${input.linkUrl}`.trim();

    await hooks.beforeFinalCall();
    const res = await this.http.request({
      method: 'POST',
      url: `${REST}/posts`,
      token: account.accessToken,
      headers: this.headers(),
      json: {
        author: this.author(account),
        commentary: toLittleText(text),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...(content ? { content } : {}),
      },
      finalCall: true,
    });
    const urn = res.headers.get('x-restli-id');
    if (!urn) throw new AdapterError('ambiguous', 'LinkedIn accepted the post but did not return its id.', 'li_no_id');
    return { externalId: urn, externalUrl: `https://www.linkedin.com/feed/update/${urn}/` };
  }

  /** LinkedIn has no cheap "did this post go live" lookup for members; a person checks. */
  async verifyPublish(): Promise<VerifyOutcome> {
    return { status: 'unknown' };
  }

  async checkHealth(account: AccountRef) {
    try {
      if (this.isOrg(account)) {
        await this.http.request({ method: 'GET', url: `${REST}/organizations/${account.externalId}`, token: account.accessToken, headers: this.headers() });
      } else {
        await this.http.request({ method: 'GET', url: 'https://api.linkedin.com/v2/userinfo', token: account.accessToken });
      }
      return { ok: true as const };
    } catch (err) {
      const e = err instanceof AdapterError ? err : new AdapterError('transient', String(err));
      return { ok: false as const, kind: e.kind, message: e.message };
    }
  }

  async fetchAccountMetrics(account: AccountRef) {
    const today = new Date().toISOString().slice(0, 10);
    let followers: number | null = null;
    if (this.isOrg(account)) {
      const res = await this.http.request<{ firstDegreeSize?: number }>({
        method: 'GET',
        url: `${REST}/networkSizes/${encodeURIComponent(this.author(account))}`,
        query: { edgeType: 'COMPANY_FOLLOWED_BY_MEMBER' },
        token: account.accessToken,
        headers: this.headers(),
      });
      followers = res.data.firstDegreeSize ?? null;
    }
    return [{ date: today, followers, impressions: null, reach: null, engagements: null, profileViews: null }];
  }

  async fetchPostMetrics(account: AccountRef, externalId: string) {
    const res = await this.http.request<{ likesSummary?: { totalLikes?: number }; commentsSummary?: { aggregatedTotalComments?: number } }>({
      method: 'GET',
      url: `${REST}/socialActions/${encodeURIComponent(externalId)}`,
      token: account.accessToken,
      headers: this.headers(),
    });
    return {
      likes: res.data.likesSummary?.totalLikes ?? null,
      comments: res.data.commentsSummary?.aggregatedTotalComments ?? null,
      shares: null,
      saves: null,
      reach: null,
      impressions: null,
      videoViews: null,
    };
  }

  async listComments(): Promise<never> {
    throw new AdapterError('permanent', 'Reading LinkedIn comments is not supported yet.', 'unsupported');
  }

  async replyToComment(): Promise<never> {
    throw new AdapterError('permanent', 'Replying to LinkedIn comments is not supported yet.', 'unsupported');
  }

  async postComment(account: AccountRef, externalPostId: string, text: string) {
    const res = await this.http.request({
      method: 'POST',
      url: `${REST}/socialActions/${encodeURIComponent(externalPostId)}/comments`,
      token: account.accessToken,
      headers: this.headers(),
      json: { actor: this.author(account), object: externalPostId, message: { text } },
      finalCall: true,
    });
    return { externalId: res.headers.get('x-restli-id') ?? `${externalPostId}:comment` };
  }
}
