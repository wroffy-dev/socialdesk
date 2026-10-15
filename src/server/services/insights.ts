import { z } from 'zod';
import { db } from '../db';
import { badRequest } from '../errors';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { adapterFor } from '../adapters/registry';
import { addDays, utcToWall, zonedToUtc } from '@/lib/time';
import { assertFeature, getWorkspacePlan, limitOf } from './entitlements';

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean).slice(0, 50) : []));

export const insightsQuerySchema = z.object({
  range: z.enum(['7d', '30d', 'mtd', 'custom']).default('30d'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  channels: csv,
});

interface Range {
  fromDate: string;
  toDate: string;
  from: Date;
  to: Date;
  days: number;
}

function resolveRange(q: z.infer<typeof insightsQuerySchema>, tz: string, maxDays: number | null): Range & { clamped: boolean } {
  const today = utcToWall(new Date(), tz).date;
  let fromDate: string;
  let toDate = today;
  if (q.range === '7d') fromDate = addDays(today, -6);
  else if (q.range === '30d') fromDate = addDays(today, -29);
  else if (q.range === 'mtd') fromDate = `${today.slice(0, 8)}01`;
  else {
    if (!q.from || !q.to) throw badRequest('Choose a start and end date.');
    if (q.from > q.to) throw badRequest('The start date must be before the end date.');
    fromDate = q.from;
    toDate = q.to > today ? today : q.to;
  }
  let clamped = false;
  if (maxDays !== null) {
    const earliest = addDays(today, -(maxDays - 1));
    if (fromDate < earliest) {
      fromDate = earliest;
      clamped = true;
    }
  }
  const from = zonedToUtc(fromDate, '00:00', tz);
  const to = zonedToUtc(addDays(toDate, 1), '00:00', tz);
  const days = Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000) + 1;
  if (days > 400) throw badRequest('Choose a range of at most 400 days.');
  return { fromDate, toDate, from, to, days, clamped };
}

const sum = (xs: (number | null | undefined)[]) => {
  const vals = xs.filter((x): x is number => typeof x === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};

function engagementRate(m: { likes: number | null; comments: number | null; shares: number | null; saves: number | null }, reach: number | null) {
  const interactions = sum([m.likes, m.comments, m.shares, m.saves]);
  if (interactions === null || !reach) return null;
  return Math.round((interactions / reach) * 10000) / 100;
}

export async function getInsights(ctx: WorkspaceCtx, raw: unknown) {
  assertCan(ctx, 'analytics.view');
  const q = insightsQuerySchema.parse(raw);
  const tz = ctx.workspace.timezone;
  const plan = await getWorkspacePlan(ctx.workspace.id);
  const range = resolveRange(q, tz, limitOf(plan, 'analytics_history_days'));
  const wsId = ctx.workspace.id;

  const accounts = await db.socialAccount.findMany({
    where: { workspaceId: wsId, status: { not: 'DISCONNECTED' }, ...(q.channels.length ? { id: { in: q.channels } } : {}) },
    select: { id: true, name: true, username: true, platform: true, avatarUrl: true, mode: true, scopes: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const [published, snapshots, baseline] = await Promise.all([
    db.platformPost.findMany({
      where: { workspaceId: wsId, socialAccountId: { in: accountIds }, status: 'PUBLISHED', publishedAt: { gte: range.from, lt: range.to } },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        postId: true,
        platform: true,
        socialAccountId: true,
        customized: true,
        caption: true,
        publishedAt: true,
        externalUrl: true,
        metric: true,
        post: { select: { baseCaption: true } },
      },
    }),
    db.metricSnapshot.findMany({
      where: { workspaceId: wsId, socialAccountId: { in: accountIds }, date: { gte: new Date(`${range.fromDate}T00:00:00Z`), lte: new Date(`${range.toDate}T00:00:00Z`) } },
      orderBy: { date: 'asc' },
    }),
    // Last known follower count before the range, per account, for growth.
    db.metricSnapshot.findMany({
      where: { workspaceId: wsId, socialAccountId: { in: accountIds }, followers: { not: null }, date: { lt: new Date(`${range.fromDate}T00:00:00Z`) } },
      orderBy: { date: 'desc' },
      distinct: ['socialAccountId'],
      select: { socialAccountId: true, followers: true },
    }),
  ]);

  // Daily series.
  const dates = Array.from({ length: range.days }, (_, i) => addDays(range.fromDate, i));
  const series = dates.map((date) => {
    const snaps = snapshots.filter((s) => s.date.toISOString().slice(0, 10) === date);
    return {
      date,
      published: published.filter((p) => utcToWall(p.publishedAt!, tz).date === date).length,
      reach: sum(snaps.map((s) => s.reach)),
      engagements: sum(snaps.map((s) => s.engagements)),
      followers: sum(snaps.map((s) => s.followers)),
    };
  });

  const latestFollowers = (accountId: string) => [...snapshots].reverse().find((s) => s.socialAccountId === accountId && s.followers !== null)?.followers ?? null;
  const earliestFollowers = (accountId: string) =>
    baseline.find((b) => b.socialAccountId === accountId)?.followers ?? snapshots.find((s) => s.socialAccountId === accountId && s.followers !== null)?.followers ?? null;

  const channels = accounts.map((a) => {
    const posts = published.filter((p) => p.socialAccountId === a.id);
    const metrics = posts.map((p) => p.metric).filter((m): m is NonNullable<typeof m> => !!m);
    const current = latestFollowers(a.id);
    const start = earliestFollowers(a.id);
    const reach = sum(snapshots.filter((s) => s.socialAccountId === a.id).map((s) => s.reach));
    const likes = sum(metrics.map((m) => m.likes));
    const comments = sum(metrics.map((m) => m.comments));
    const shares = sum(metrics.map((m) => m.shares));
    const saves = sum(metrics.map((m) => m.saves));
    const postReach = sum(metrics.map((m) => m.reach));
    const caps = adapterFor(a).capabilities({ scopes: a.scopes });
    const notes: string[] = [];
    if (a.mode === 'MOCK') notes.push('Mock channel: no analytics');
    else if (!caps.analytics) notes.push('Analytics permission not granted');
    else if (snapshots.every((s) => s.socialAccountId !== a.id)) notes.push('Waiting for first sync');
    return {
      id: a.id,
      name: a.name,
      username: a.username,
      platform: a.platform,
      avatarUrl: a.avatarUrl,
      posts: posts.length,
      followers: current,
      followerChange: current !== null && start !== null ? current - start : null,
      reach,
      likes,
      comments,
      shares,
      engagementRate: engagementRate({ likes, comments, shares, saves }, postReach),
      notes,
    };
  });

  const allMetrics = published.map((p) => p.metric).filter((m): m is NonNullable<typeof m> => !!m);
  const totals = {
    postsPublished: published.length,
    followers: sum(channels.map((c) => c.followers)),
    followerChange: channels.some((c) => c.followerChange !== null) ? sum(channels.map((c) => c.followerChange)) : null,
    reach: sum(snapshots.map((s) => s.reach)),
    likes: sum(allMetrics.map((m) => m.likes)),
    comments: sum(allMetrics.map((m) => m.comments)),
    shares: sum(allMetrics.map((m) => m.shares)),
    engagementRate: engagementRate(
      { likes: sum(allMetrics.map((m) => m.likes)), comments: sum(allMetrics.map((m) => m.comments)), shares: sum(allMetrics.map((m) => m.shares)), saves: sum(allMetrics.map((m) => m.saves)) },
      sum(allMetrics.map((m) => m.reach)),
    ),
  };

  const posts = published
    .map((p) => {
      const m = p.metric;
      const interactions = m ? sum([m.likes, m.comments, m.shares, m.saves]) : null;
      return {
        id: p.id,
        postId: p.postId,
        platform: p.platform,
        accountName: accounts.find((a) => a.id === p.socialAccountId)?.name ?? '',
        caption: p.customized ? p.caption : p.post.baseCaption,
        publishedAt: p.publishedAt!.toISOString(),
        externalUrl: p.externalUrl,
        likes: m?.likes ?? null,
        comments: m?.comments ?? null,
        shares: m?.shares ?? null,
        saves: m?.saves ?? null,
        reach: m?.reach ?? null,
        impressions: m?.impressions ?? null,
        videoViews: m?.videoViews ?? null,
        interactions,
        engagementRate: m ? engagementRate(m, m.reach) : null,
        metricsFetchedAt: m?.fetchedAt.toISOString() ?? null,
      };
    })
    .sort((a, b) => (b.interactions ?? -1) - (a.interactions ?? -1));

  return {
    range: { from: range.fromDate, to: range.toDate, days: range.days, clamped: range.clamped, maxDays: limitOf(plan, 'analytics_history_days') },
    canExport: plan.entitlements.get('analytics_export')?.enabled ?? false,
    timezone: tz,
    totals,
    series,
    channels,
    posts,
    hasAnyMetrics: snapshots.length > 0 || allMetrics.length > 0,
  };
}

export type Insights = Awaited<ReturnType<typeof getInsights>>;

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Prevent spreadsheet formula injection from user-generated captions.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportInsightsCsv(ctx: WorkspaceCtx, raw: unknown) {
  const plan = await getWorkspacePlan(ctx.workspace.id);
  assertFeature(plan, 'analytics_export');
  const data = await getInsights(ctx, raw);
  const header = ['Published at', 'Channel', 'Platform', 'Caption', 'Likes/Reactions', 'Comments', 'Shares', 'Saves', 'Reach', 'Impressions', 'Video views', 'Engagement rate %', 'URL'];
  const rows = data.posts.map((p) => [
    p.publishedAt,
    p.accountName,
    p.platform,
    p.caption.replace(/\s+/g, ' ').slice(0, 500),
    p.likes,
    p.comments,
    p.shares,
    p.saves,
    p.reach,
    p.impressions,
    p.videoViews,
    p.engagementRate,
    p.externalUrl,
  ]);
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  return { filename: `insights-${ctx.workspace.slug}-${data.range.from}-to-${data.range.to}.csv`, body: `﻿${body}\r\n` };
}
