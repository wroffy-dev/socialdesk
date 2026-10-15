import { randomBytes } from 'node:crypto';
import { PLATFORM_INFO } from '@/lib/platforms';
import { AdapterError, type AccountRef, type Capabilities, type Platform, type PublishHooks, type PublishInput, type PublishResult, type SocialAdapter, type VerifyOutcome } from './types';

/**
 * In-process stand-in for local development and automated tests. It never contacts a real
 * platform and its results are never shown as real data (channels are marked "Mock").
 *
 * Captions can trigger failure modes:
 *   #mock-fail      → permanent error
 *   #mock-flaky     → transient error on the first attempt only
 *   #mock-timeout   → ambiguous outcome (verification says "not published")
 *   #mock-authfail  → token revoked
 * A first comment containing #mock-commentfail is rejected.
 */
export class MockAdapter implements SocialAdapter {
  private static flakySeen = new Set<string>();
  /** Published posts per version, so verification and idempotency behave realistically. */
  private static published = new Map<string, PublishResult>();

  constructor(readonly platform: Platform) {}

  capabilities(_account: { scopes: string[] }): Capabilities {
    return {
      formats: PLATFORM_INFO[this.platform].formats,
      publish: true,
      analytics: false,
      comments: false,
      replyToComments: false,
      firstComment: true,
      directMessages: false,
      missing: ['Mock channel: analytics and comments are not simulated'],
    };
  }

  async publish(input: PublishInput, hooks: PublishHooks): Promise<PublishResult> {
    const already = MockAdapter.published.get(input.idempotencyKey);
    if (already) return already;
    if (this.platform === 'INSTAGRAM' && input.media.length === 0) throw new AdapterError('permanent', 'Instagram posts need at least one image or video.', 'ig_no_media');
    if (this.platform === 'YOUTUBE' && input.media[0]?.kind !== 'VIDEO') throw new AdapterError('permanent', 'YouTube needs exactly one video.', 'yt_no_video');
    if (input.caption.includes('#mock-fail')) throw new AdapterError('permanent', 'Mock platform rejected this post.', 'mock_permanent');
    if (input.caption.includes('#mock-authfail')) throw new AdapterError('auth', 'Mock token was revoked.', 'mock_auth');
    if (input.caption.includes('#mock-flaky') && !MockAdapter.flakySeen.has(input.idempotencyKey)) {
      MockAdapter.flakySeen.add(input.idempotencyKey);
      throw new AdapterError('transient', 'Mock platform is temporarily unavailable.', 'mock_transient', 1);
    }
    await hooks.saveState({ mockContainer: `container-${input.idempotencyKey}` });
    await hooks.beforeFinalCall();
    if (input.caption.includes('#mock-timeout')) throw new AdapterError('ambiguous', 'Mock platform did not respond in time.', 'timeout');
    const id = `mock_${this.platform.toLowerCase()}_${randomBytes(6).toString('hex')}`;
    const result = { externalId: id, externalUrl: null };
    MockAdapter.published.set(input.idempotencyKey, result);
    return result;
  }

  async verifyPublish(input: PublishInput, _since: Date): Promise<VerifyOutcome> {
    const r = MockAdapter.published.get(input.idempotencyKey);
    return r ? { status: 'published', ...r } : { status: 'not_published' };
  }

  async checkHealth(_account: AccountRef) {
    return { ok: true as const };
  }

  async fetchAccountMetrics() {
    return [];
  }

  async fetchPostMetrics() {
    return { likes: null, comments: null, shares: null, saves: null, reach: null, impressions: null, videoViews: null };
  }

  async listComments() {
    return [];
  }

  /** First comments posted per external post id (inspectable in tests). */
  static comments = new Map<string, string[]>();

  async postComment(_account: AccountRef, externalPostId: string, text: string) {
    if (text.includes('#mock-commentfail')) throw new AdapterError('permanent', 'Mock platform rejected the comment.', 'mock_comment');
    MockAdapter.comments.set(externalPostId, [...(MockAdapter.comments.get(externalPostId) ?? []), text]);
    return { externalId: `mock_comment_${randomBytes(6).toString('hex')}` };
  }

  async replyToComment(): Promise<{ externalId: string }> {
    throw new AdapterError('permanent', 'Replies are not available for mock channels.', 'unsupported');
  }
}
