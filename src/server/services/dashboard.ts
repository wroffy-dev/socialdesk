import { db } from '../db';
import { assertCan, type WorkspaceCtx } from '../auth/ctx';
import { toDto as mediaDto } from './media';
import { utcToWall, zonedToUtc, addDays } from '@/lib/time';

/** Start of the current week (Sunday 00:00) in the workspace timezone, as UTC. */
function weekStart(tz: string, now = new Date()) {
  const wall = utcToWall(now, tz);
  return zonedToUtc(addDays(wall.date, -wall.weekday), '00:00', tz);
}

export async function getDashboard(ctx: WorkspaceCtx) {
  assertCan(ctx, 'workspace.view');
  const wsId = ctx.workspace.id;
  const tz = ctx.workspace.timezone;
  const now = new Date();
  const thisWeek = weekStart(tz, now);
  const lastWeek = new Date(thisWeek.getTime() - 7 * 24 * 3600 * 1000);

  const [
    channels,
    statusCounts,
    publishedThisWeek,
    publishedLastWeek,
    drafts,
    upcoming,
    activity,
    unansweredComments,
    commentsThisWeek,
    commentsLastWeek,
    latestSnapshots,
    weekAgoSnapshots,
    postCount,
  ] = await Promise.all([
    db.socialAccount.findMany({
      where: { workspaceId: wsId, status: { not: 'DISCONNECTED' } },
      select: { id: true, name: true, username: true, platform: true, avatarUrl: true, status: true, mode: true },
    }),
    db.socialPost.groupBy({ by: ['status'], where: { workspaceId: wsId }, _count: { _all: true } }),
    db.platformPost.count({ where: { workspaceId: wsId, status: 'PUBLISHED', publishedAt: { gte: thisWeek } } }),
    db.platformPost.count({ where: { workspaceId: wsId, status: 'PUBLISHED', publishedAt: { gte: lastWeek, lt: thisWeek } } }),
    db.socialPost.findMany({
      where: { workspaceId: wsId, status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        baseCaption: true,
        baseMediaIds: true,
        updatedAt: true,
        versions: { select: { platform: true, customized: true, caption: true, socialAccount: { select: { name: true } } } },
      },
    }),
    db.socialPost.findMany({
      where: { workspaceId: wsId, status: 'SCHEDULED', scheduledAt: { gte: now } },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
      select: {
        id: true,
        baseCaption: true,
        scheduledAt: true,
        publishMode: true,
        versions: { select: { platform: true, customized: true, caption: true, socialAccount: { select: { id: true, name: true, avatarUrl: true, platform: true } } } },
      },
    }),
    db.platformPost.findMany({
      where: { workspaceId: wsId, status: { in: ['PUBLISHED', 'FAILED', 'NEEDS_VERIFICATION'] } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        postId: true,
        status: true,
        platform: true,
        caption: true,
        customized: true,
        publishedAt: true,
        updatedAt: true,
        externalUrl: true,
        lastError: true,
        post: { select: { baseCaption: true } },
        socialAccount: { select: { name: true } },
      },
    }),
    db.comment.findMany({
      where: { workspaceId: wsId, answered: false, isOwn: false, hidden: false },
      orderBy: { postedAt: 'desc' },
      take: 3,
      select: { id: true, authorName: true, body: true, postedAt: true, socialAccount: { select: { platform: true, name: true } } },
    }),
    db.comment.count({ where: { workspaceId: wsId, isOwn: false, postedAt: { gte: thisWeek } } }),
    db.comment.count({ where: { workspaceId: wsId, isOwn: false, postedAt: { gte: lastWeek, lt: thisWeek } } }),
    db.metricSnapshot.findMany({
      where: { workspaceId: wsId, followers: { not: null } },
      orderBy: { date: 'desc' },
      distinct: ['socialAccountId'],
      select: { socialAccountId: true, followers: true, date: true },
    }),
    db.metricSnapshot.findMany({
      where: { workspaceId: wsId, followers: { not: null }, date: { lte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
      orderBy: { date: 'desc' },
      distinct: ['socialAccountId'],
      select: { socialAccountId: true, followers: true },
    }),
    db.socialPost.count({ where: { workspaceId: wsId } }),
  ]);

  const baseIds = drafts.map((d) => d.baseMediaIds[0]).filter((m): m is string => !!m);
  const media = new Map(
    (baseIds.length ? await db.mediaAsset.findMany({ where: { id: { in: baseIds }, workspaceId: wsId, deletedAt: null } }) : []).map((m) => [m.id, m]),
  );

  const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) as Record<string, number>;
  const followers = latestSnapshots.length ? latestSnapshots.reduce((n, s) => n + (s.followers ?? 0), 0) : null;
  const followersBefore = weekAgoSnapshots.length ? weekAgoSnapshots.reduce((n, s) => n + (s.followers ?? 0), 0) : null;

  const captionOf = (base: string, versions: { customized: boolean; caption: string }[]) =>
    base || versions.find((v) => v.customized && v.caption)?.caption || '';

  return {
    weekStart: thisWeek.toISOString(),
    channels,
    counts: {
      scheduled: counts.SCHEDULED ?? 0,
      drafts: counts.DRAFT ?? 0,
      failed: (counts.FAILED ?? 0) + (counts.PARTIALLY_PUBLISHED ?? 0),
      published: (counts.PUBLISHED ?? 0) + (counts.PARTIALLY_PUBLISHED ?? 0),
    },
    pulse: {
      posts: { value: publishedThisWeek, previous: publishedLastWeek },
      comments: { value: commentsThisWeek, previous: commentsLastWeek },
      followers: followers === null ? null : { value: followers, previous: followersBefore },
    },
    drafts: drafts.map((d) => ({
      id: d.id,
      caption: captionOf(d.baseCaption, d.versions),
      updatedAt: d.updatedAt.toISOString(),
      platforms: [...new Set(d.versions.map((v) => v.platform))],
      thumb: d.baseMediaIds[0] && media.get(d.baseMediaIds[0]) ? mediaDto(media.get(d.baseMediaIds[0])!) : null,
    })),
    upcoming: upcoming.map((u) => ({
      id: u.id,
      caption: captionOf(u.baseCaption, u.versions),
      scheduledAt: u.scheduledAt!.toISOString(),
      publishMode: u.publishMode,
      channels: u.versions.map((v) => v.socialAccount),
    })),
    activity: activity.map((a) => ({
      id: a.id,
      postId: a.postId,
      status: a.status,
      platform: a.platform,
      accountName: a.socialAccount.name,
      caption: a.customized ? a.caption : a.post.baseCaption,
      at: (a.publishedAt ?? a.updatedAt).toISOString(),
      externalUrl: a.externalUrl,
      error: a.lastError,
    })),
    comments: {
      unanswered: unansweredComments.map((c) => ({ ...c, postedAt: c.postedAt.toISOString() })),
    },
    isNew: channels.length === 0 || postCount === 0,
    postCount,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
