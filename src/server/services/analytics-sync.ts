import { db } from '../db';
import { adapterFor } from '../adapters/registry';
import { AdapterError } from '../adapters/types';
import { accountRef } from '../integrations/tokens';

const DAY = 24 * 3600_000;

/**
 * Pulls account- and post-level metrics from each platform that permits it. Values the
 * platform doesn't provide stay null; nothing is estimated.
 */
export async function syncAnalytics(opts: { workspaceId?: string } = {}) {
  const accounts = await db.socialAccount.findMany({
    where: { status: 'CONNECTED', mode: { not: 'MOCK' }, ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}) },
    include: { syncStates: { where: { kind: 'analytics' } } },
  });
  const stats = { accounts: 0, snapshots: 0, posts: 0, errors: 0 };
  for (const acc of accounts) {
    const adapter = adapterFor(acc);
    if (!adapter.capabilities(acc).analytics) continue;
    const last = acc.syncStates[0]?.lastSyncedAt;
    const since = new Date(Math.max(Date.now() - 30 * DAY, (last?.getTime() ?? 0) - 2 * DAY));
    try {
      const ref = await accountRef(acc);
      const daily = await adapter.fetchAccountMetrics(ref, since, new Date());
      for (const d of daily) {
        const date = new Date(`${d.date}T00:00:00Z`);
        const data = {
          followers: d.followers ?? undefined,
          impressions: d.impressions ?? undefined,
          reach: d.reach ?? undefined,
          engagements: d.engagements ?? undefined,
          profileViews: d.profileViews ?? undefined,
        };
        await db.metricSnapshot.upsert({
          where: { socialAccountId_date: { socialAccountId: acc.id, date } },
          create: { workspaceId: acc.workspaceId, socialAccountId: acc.id, date, ...data },
          update: { ...data, fetchedAt: new Date() },
        });
        stats.snapshots++;
      }
      const recent = await db.platformPost.findMany({
        where: { socialAccountId: acc.id, status: 'PUBLISHED', externalId: { not: null }, publishedAt: { gt: new Date(Date.now() - 30 * DAY) } },
        select: { id: true, externalId: true, workspaceId: true },
        take: 100,
      });
      for (const p of recent) {
        try {
          const m = await adapter.fetchPostMetrics(ref, p.externalId!);
          await db.postMetric.upsert({
            where: { platformPostId: p.id },
            create: { workspaceId: p.workspaceId, platformPostId: p.id, ...m },
            update: { ...m, fetchedAt: new Date() },
          });
          stats.posts++;
        } catch (err) {
          if (err instanceof AdapterError && err.kind === 'auth') throw err;
          // A deleted post or unsupported metric shouldn't stop the rest.
        }
      }
      await db.integrationSyncState.upsert({
        where: { socialAccountId_kind: { socialAccountId: acc.id, kind: 'analytics' } },
        create: { socialAccountId: acc.id, kind: 'analytics', lastSyncedAt: new Date() },
        update: { lastSyncedAt: new Date(), lastError: null },
      });
      stats.accounts++;
    } catch (err) {
      stats.errors++;
      const message = (err as Error).message;
      await db.integrationSyncState.upsert({
        where: { socialAccountId_kind: { socialAccountId: acc.id, kind: 'analytics' } },
        create: { socialAccountId: acc.id, kind: 'analytics', lastError: message },
        update: { lastError: message },
      });
      if (err instanceof AdapterError && err.kind === 'auth') {
        await db.socialAccount.update({ where: { id: acc.id }, data: { status: 'NEEDS_REAUTH', lastError: message } });
      }
    }
  }
  return stats;
}
