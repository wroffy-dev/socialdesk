import { db } from '../db';
import { accountRef } from '../integrations/tokens';
import { conflict, notFound } from '../errors';
import { audit } from '../audit';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { adapterFor } from '../adapters/registry';
import { AdapterError } from '../adapters/types';
import { normalizeOptions } from '@/lib/post-options';

/** A claim older than this is considered abandoned (e.g. the worker crashed mid-request). */
const STALE_CLAIM_MS = 5 * 60_000;

export type FirstCommentOutcome = 'posted' | 'skipped' | 'busy' | 'failed';

/**
 * Posts the version's "first comment" on its published post. Runs once after publishing and can
 * be retried by a person. A conditional update claims the work so two callers can't both post.
 * A failure never affects the post itself; it is recorded on the version for the post page.
 */
export async function postFirstComment(versionId: string): Promise<FirstCommentOutcome> {
  const v = await db.platformPost.findUnique({ where: { id: versionId }, include: { socialAccount: true } });
  if (!v || v.status !== 'PUBLISHED' || !v.externalId || v.firstCommentId || v.format === 'STORY') return 'skipped';
  const text = normalizeOptions(v.platform, v.options).firstComment.trim();
  if (!text) return 'skipped';

  const claimed = await db.platformPost.updateMany({
    where: { id: v.id, firstCommentId: null, OR: [{ firstCommentAt: null }, { firstCommentAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } }] },
    data: { firstCommentAt: new Date(), firstCommentError: null },
  });
  if (claimed.count !== 1) return 'busy';

  try {
    const adapter = adapterFor({ platform: v.platform, mode: v.socialAccount.mode });
    const res = await adapter.postComment(await accountRef(v.socialAccount), v.externalId, text);
    await db.platformPost.update({ where: { id: v.id }, data: { firstCommentId: res.externalId, firstCommentError: null } });
    return 'posted';
  } catch (err) {
    const e = err instanceof AdapterError ? err : new AdapterError('transient', (err as Error)?.message ?? 'Unexpected error');
    const message =
      e.kind === 'ambiguous'
        ? `The platform didn't confirm the comment; it may have been posted. Check the post before retrying. (${e.message})`
        : e.message;
    await db.platformPost.update({ where: { id: v.id }, data: { firstCommentError: message.slice(0, 1000), firstCommentAt: null } });
    return 'failed';
  }
}

/** Manual retry from the post page. */
export async function retryFirstComment(ctx: WorkspaceCtx, versionId: string) {
  assertCan(ctx, 'posts.publish');
  const v = await db.platformPost.findFirst({ where: { id: versionId, workspaceId: ctx.workspace.id } });
  if (!v) throw notFound('Post version');
  if (v.status !== 'PUBLISHED') throw conflict('The first comment is posted once the post is published.');
  if (v.firstCommentId) throw conflict('The first comment was already posted.');
  const outcome = await postFirstComment(v.id);
  if (outcome === 'busy') throw conflict('The first comment is being posted right now.');
  if (outcome === 'skipped') throw conflict('This post has no first comment to post.');
  await audit({ action: 'post.first_comment', actorId: ctx.user.id, workspaceId: ctx.workspace.id, targetType: 'platform_post', targetId: v.id, metadata: { outcome } });
  return { postId: v.postId, outcome };
}
