import type { PostFormat } from '@/lib/platforms';

export type Platform = 'INSTAGRAM' | 'FACEBOOK';

/**
 * How a failure should be handled:
 * - transient: safe to retry automatically (network error before sending, 5xx, rate limit)
 * - permanent: retrying won't help (validation, policy, unsupported media)
 * - auth: token invalid/expired or permission revoked; the channel must be reconnected
 * - ambiguous: the request may have reached the platform; never retried automatically
 */
export type FailureKind = 'transient' | 'permanent' | 'auth' | 'ambiguous';

export class AdapterError extends Error {
  constructor(
    public readonly kind: FailureKind,
    message: string,
    public readonly code?: string,
    public readonly retryAfterSec?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export class UnsupportedCapabilityError extends AdapterError {
  constructor(platform: Platform, capability: string) {
    super('permanent', `${platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} does not support ${capability} through its official API.`, 'unsupported');
  }
}

export interface AccountRef {
  id: string;
  externalId: string;
  accessToken: string;
  metadata: Record<string, unknown>;
  scopes: string[];
}

export interface PublishMedia {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  mimeType: string;
  /** Short-lived public URL the platform downloads from. */
  url: string;
  durationSec: number | null;
}

export interface PublishInput {
  account: AccountRef;
  format: PostFormat;
  caption: string;
  linkUrl: string | null;
  media: PublishMedia[];
  /** Stable per platform version; adapters may use it for de-duplication. */
  idempotencyKey: string;
  /** State saved by an earlier attempt (e.g. an Instagram container id) so retries resume. */
  providerState: Record<string, unknown> | null;
}

export interface PublishHooks {
  /** Persist intermediate state before the final, non-idempotent call. */
  saveState(state: Record<string, unknown>): Promise<void>;
  /** Called right before the request that actually makes the post public. */
  beforeFinalCall(): Promise<void>;
}

export interface PublishResult {
  externalId: string;
  externalUrl: string | null;
}

export type VerifyOutcome = { status: 'published'; externalId: string; externalUrl: string | null } | { status: 'not_published' } | { status: 'unknown' };

export interface DailyAccountMetrics {
  date: string;
  followers: number | null;
  impressions: number | null;
  reach: number | null;
  engagements: number | null;
  profileViews: number | null;
}

export interface PostMetrics {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  impressions: number | null;
  videoViews: number | null;
}

export interface RemoteComment {
  externalId: string;
  parentExternalId: string | null;
  authorName: string;
  authorHandle: string | null;
  body: string;
  postedAt: string;
  isOwn: boolean;
}

export interface Capabilities {
  formats: PostFormat[];
  publish: boolean;
  analytics: boolean;
  comments: boolean;
  replyToComments: boolean;
  directMessages: boolean;
  /** Human-readable reasons a capability is off (e.g. a missing permission). */
  missing: string[];
}

/** One implementation per platform. Unsupported operations throw UnsupportedCapabilityError. */
export interface SocialAdapter {
  readonly platform: Platform;
  capabilities(account: Pick<AccountRef, 'scopes'>): Capabilities;
  publish(input: PublishInput, hooks: PublishHooks): Promise<PublishResult>;
  /** Determines whether an ambiguous publish actually went live. */
  verifyPublish(input: PublishInput, since: Date): Promise<VerifyOutcome>;
  checkHealth(account: AccountRef): Promise<{ ok: true } | { ok: false; kind: FailureKind; message: string }>;
  fetchAccountMetrics(account: AccountRef, since: Date, until: Date): Promise<DailyAccountMetrics[]>;
  fetchPostMetrics(account: AccountRef, externalId: string): Promise<PostMetrics>;
  listComments(account: AccountRef, externalPostId: string): Promise<RemoteComment[]>;
  replyToComment(account: AccountRef, commentExternalId: string, text: string): Promise<{ externalId: string }>;
}
