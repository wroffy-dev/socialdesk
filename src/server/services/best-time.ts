import { z } from 'zod';
import type { Platform } from '@/lib/platforms';
import { db } from '../db';
import { audit } from '../audit';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { upcomingSlotInstants, utcToWall } from '@/lib/time';
import { getQueue } from './queue';

/**
 * "Best time to post" from the workspace's own results: every published post with synced
 * metrics is placed in its weekday × hour (workspace timezone) and scored by engagement relative
 * to its channel's typical post, so a big and a small channel can be combined fairly. Nothing is
 * estimated: with too few posts the answer is "not enough data yet".
 */

const HISTORY_DAYS = 180;
/** Posts with metrics needed before any recommendation is shown. */
export const MIN_POSTS = 6;
/** A time slot needs this many posts before it can be recommended. */
const MIN_SLOT_POSTS = 2;

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean).slice(0, 50) : []));

export const bestTimeQuerySchema = z.object({ channels: csv, projects: csv });

export interface BestTimeCell {
  /** 0 = Sunday … 6 = Saturday, in the workspace timezone. */
  day: number;
  hour: number;
  posts: number;
  /** Average engagement relative to each channel's median post (1 = typical). */
  score: number;
}

export interface BestTimeSlot extends BestTimeCell {
  /** Next occurrence of this weekday/hour, as an ISO timestamp. */
  nextAt: string;
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const engagement = (m: { likes: number | null; comments: number | null; shares: number | null; saves: number | null }) => {
  const parts = [m.likes, m.comments, m.shares, m.saves];
  return parts.every((p) => p == null) ? null : parts.reduce<number>((n, p) => n + (p ?? 0), 0);
};

/** Pure scoring step, exported for tests. */
export function scorePosts(posts: { accountId: string; publishedAt: Date; engagement: number }[], tz: string) {
  const byAccount = new Map<string, number[]>();
  for (const p of posts) byAccount.set(p.accountId, [...(byAccount.get(p.accountId) ?? []), p.engagement]);
  const baseline = new Map([...byAccount].map(([id, v]) => [id, Math.max(1, median(v))]));
  const cells = new Map<string, { day: number; hour: number; posts: number; total: number }>();
  for (const p of posts) {
    const w = utcToWall(p.publishedAt, tz);
    const hour = Number(w.time.slice(0, 2));
    const key = `${w.weekday}-${hour}`;
    const c = cells.get(key) ?? { day: w.weekday, hour, posts: 0, total: 0 };
    c.posts++;
    c.total += p.engagement / baseline.get(p.accountId)!;
    cells.set(key, c);
  }
  return [...cells.values()]
    .map((c) => ({ day: c.day, hour: c.hour, posts: c.posts, score: Math.round((c.total / c.posts) * 100) / 100 }))
    .sort((a, b) => a.day - b.day || a.hour - b.hour);
}

export async function getBestTimes(ctx: WorkspaceCtx, raw: unknown) {
  assertCan(ctx, 'analytics.view');
  const q = bestTimeQuerySchema.parse(raw);
  const tz = ctx.workspace.timezone;
  const rows = await db.platformPost.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      status: 'PUBLISHED',
      publishedAt: { gte: new Date(Date.now() - HISTORY_DAYS * 24 * 3600_000) },
      metric: { isNot: null },
      ...(q.channels.length ? { socialAccountId: { in: q.channels } } : {}),
      ...(q.projects.length ? { post: { projectId: { in: q.projects } } } : {}),
    },
    select: { socialAccountId: true, platform: true, publishedAt: true, metric: { select: { likes: true, comments: true, shares: true, saves: true } } },
  });
  const posts = rows
    .map((r) => ({ accountId: r.socialAccountId, platform: r.platform as Platform, publishedAt: r.publishedAt!, engagement: r.metric ? engagement(r.metric) : null }))
    .filter((p): p is typeof p & { engagement: number } => p.engagement !== null);

  const cells = scorePosts(posts, tz);
  const enough = posts.length >= MIN_POSTS;
  const ranked = cells.filter((c) => c.posts >= MIN_SLOT_POSTS && c.score > 0).sort((a, b) => b.score - a.score || b.posts - a.posts);
  const now = new Date();
  const top: BestTimeSlot[] = enough
    ? ranked.slice(0, 3).map((c) => ({
        ...c,
        nextAt: upcomingSlotInstants([{ dayOfWeek: c.day, time: `${String(c.hour).padStart(2, '0')}:00` }], tz, new Date(now.getTime() + 60_000), 1)[0]!.toISOString(),
      }))
    : [];
  return {
    timezone: tz,
    totalPosts: posts.length,
    minPosts: MIN_POSTS,
    enough,
    confidence: posts.length >= 40 ? 'high' : posts.length >= 15 ? 'medium' : 'low',
    platforms: [...new Set(posts.map((p) => p.platform))],
    cells,
    top,
  };
}

export type BestTimes = Awaited<ReturnType<typeof getBestTimes>>;

/** Adds the recommended times to the posting queue (keeps the existing slots). */
export async function addBestTimesToQueue(ctx: WorkspaceCtx, raw: unknown) {
  assertCan(ctx, 'queue.manage');
  const best = await getBestTimes(ctx, raw);
  if (!best.top.length) return { added: 0, queue: await getQueue(ctx) };
  const existing = await db.queueSlot.findMany({ where: { workspaceId: ctx.workspace.id, socialAccountId: null } });
  const toAdd = best.top
    .map((t) => ({ dayOfWeek: t.day, time: `${String(t.hour).padStart(2, '0')}:00` }))
    .filter((s) => !existing.some((e) => e.dayOfWeek === s.dayOfWeek && e.time === s.time));
  if (toAdd.length) await db.queueSlot.createMany({ data: toAdd.map((s) => ({ ...s, workspaceId: ctx.workspace.id })), skipDuplicates: true });
  await audit({ action: 'queue.best_times_added', actorId: ctx.user.id, workspaceId: ctx.workspace.id, metadata: { added: toAdd } });
  return { added: toAdd.length, queue: await getQueue(ctx) };
}
