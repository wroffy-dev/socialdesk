import { db } from '../db';
import { adapterFor } from '../adapters/registry';
import { AdapterError } from '../adapters/types';
import { toAccountRef } from './channels';

/** Imports comments on recently published posts for channels whose permissions allow it. */
export async function syncComments(opts: { workspaceId?: string } = {}) {
  const accounts = await db.socialAccount.findMany({
    where: { status: 'CONNECTED', mode: { not: 'MOCK' }, ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}) },
  });
  const stats = { accounts: 0, comments: 0, errors: 0 };
  for (const acc of accounts) {
    const adapter = adapterFor(acc);
    if (!adapter.capabilities({ scopes: acc.scopes }).comments) continue;
    const ref = toAccountRef(acc);
    const posts = await db.platformPost.findMany({
      where: { socialAccountId: acc.id, status: 'PUBLISHED', externalId: { not: null }, publishedAt: { gt: new Date(Date.now() - 14 * 24 * 3600_000) } },
      select: { id: true, externalId: true },
      take: 50,
    });
    try {
      for (const p of posts) {
        const comments = await adapter.listComments(ref, p.externalId!);
        const ownReplyParents = new Set(comments.filter((c) => c.isOwn && c.parentExternalId).map((c) => c.parentExternalId!));
        for (const c of comments) {
          await db.comment.upsert({
            where: { socialAccountId_externalId: { socialAccountId: acc.id, externalId: c.externalId } },
            create: {
              workspaceId: acc.workspaceId,
              socialAccountId: acc.id,
              platformPostId: p.id,
              externalId: c.externalId,
              parentExternalId: c.parentExternalId,
              authorName: c.authorName,
              authorHandle: c.authorHandle,
              body: c.body,
              isOwn: c.isOwn,
              answered: c.isOwn || ownReplyParents.has(c.externalId),
              postedAt: new Date(c.postedAt),
            },
            update: { body: c.body, ...(ownReplyParents.has(c.externalId) ? { answered: true } : {}) },
          });
          stats.comments++;
        }
      }
      await db.integrationSyncState.upsert({
        where: { socialAccountId_kind: { socialAccountId: acc.id, kind: 'comments' } },
        create: { socialAccountId: acc.id, kind: 'comments', lastSyncedAt: new Date() },
        update: { lastSyncedAt: new Date(), lastError: null },
      });
      stats.accounts++;
    } catch (err) {
      stats.errors++;
      if (err instanceof AdapterError && err.kind === 'auth') {
        await db.socialAccount.update({ where: { id: acc.id }, data: { status: 'NEEDS_REAUTH', lastError: err.message } });
      }
      await db.integrationSyncState.upsert({
        where: { socialAccountId_kind: { socialAccountId: acc.id, kind: 'comments' } },
        create: { socialAccountId: acc.id, kind: 'comments', lastError: (err as Error).message },
        update: { lastError: (err as Error).message },
      });
    }
  }
  return stats;
}
