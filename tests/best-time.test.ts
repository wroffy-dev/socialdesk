import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { addBestTimesToQueue, getBestTimes, MIN_POSTS, scorePosts } from '@/server/services/best-time';
import { zonedToUtc } from '@/lib/time';
import { addMember, makeChannel, makeWorkspace } from './helpers/factories';

const TZ = 'Asia/Kolkata';

/** A published post at a local date/time with the given engagement. */
async function published(ctx: Awaited<ReturnType<typeof makeWorkspace>>['ctx'], accountId: string, date: string, time: string, likes: number) {
  const project = await db.socialAccount.findUniqueOrThrow({ where: { id: accountId }, select: { projectId: true, platform: true } });
  const at = zonedToUtc(date, time, TZ);
  const post = await db.socialPost.create({ data: { workspaceId: ctx.workspace.id, projectId: project.projectId, status: 'PUBLISHED', baseCaption: 'x', scheduledAt: at } });
  const v = await db.platformPost.create({
    data: { workspaceId: ctx.workspace.id, postId: post.id, socialAccountId: accountId, platform: project.platform, status: 'PUBLISHED', publishedAt: at, externalId: `e-${post.id}` },
  });
  await db.postMetric.create({ data: { workspaceId: ctx.workspace.id, platformPostId: v.id, likes, comments: 0, shares: null, saves: null } });
}

// Recent dates (within the 6-month window): Tuesdays and Thursdays.
const recent = (weeksAgo: number, weekday: number) => {
  const d = new Date(Date.now() - weeksAgo * 7 * 24 * 3600_000);
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7) - 7);
  return d.toISOString().slice(0, 10);
};

describe('best time to post', () => {
  it('scores by engagement relative to each channel, so big and small channels combine fairly', () => {
    const t = (date: string, time: string) => zonedToUtc(date, time, TZ);
    const cells = scorePosts(
      [
        // Big channel: median 1000. A 2000 post at Tue 18:00 is 2× its typical post.
        { accountId: 'big', publishedAt: t('2026-09-01', '18:10'), engagement: 2000 },
        { accountId: 'big', publishedAt: t('2026-09-02', '09:00'), engagement: 1000 },
        { accountId: 'big', publishedAt: t('2026-09-03', '09:00'), engagement: 500 },
        // Small channel: median 10. A 30 post at Tue 18:00 is 3× its typical post.
        { accountId: 'small', publishedAt: t('2026-09-08', '18:45'), engagement: 30 },
        { accountId: 'small', publishedAt: t('2026-09-09', '09:00'), engagement: 10 },
        { accountId: 'small', publishedAt: t('2026-09-10', '09:00'), engagement: 5 },
      ],
      TZ,
    );
    const tue18 = cells.find((c) => c.day === 2 && c.hour === 18)!;
    expect(tue18).toMatchObject({ posts: 2, score: 2.5 });
  });

  it('needs enough posts, then recommends the strongest slots and can add them to the queue', async () => {
    const { ws, ctx } = await makeWorkspace('Timing Co');
    const ch = await makeChannel(ws.id, 'INSTAGRAM');
    expect(await getBestTimes(ctx, {})).toMatchObject({ enough: false, totalPosts: 0, top: [] });

    // Thursday 19:00 consistently beats Tuesday 10:00.
    for (let w = 1; w <= 4; w++) {
      await published(ctx, ch.id, recent(w, 4), '19:05', 300);
      await published(ctx, ch.id, recent(w, 2), '10:20', 60);
    }
    // Posts without metrics are ignored, not counted as zero.
    const noMetric = await db.platformPost.findFirstOrThrow({ where: { socialAccountId: ch.id } });
    await db.postMetric.update({ where: { platformPostId: noMetric.id }, data: { likes: null, comments: null } });

    const best = await getBestTimes(ctx, { channels: ch.id });
    expect(best.totalPosts).toBe(7);
    expect(best.totalPosts).toBeGreaterThanOrEqual(MIN_POSTS);
    expect(best.enough).toBe(true);
    expect(best.top[0]).toMatchObject({ day: 4, hour: 19 });
    expect(best.top[1]).toMatchObject({ day: 2, hour: 10 });
    expect(new Date(best.top[0]!.nextAt).getTime()).toBeGreaterThan(Date.now());

    // Other channels' data doesn't leak into a filtered view or another workspace.
    const other = await makeWorkspace('Other timing');
    expect((await getBestTimes(other.ctx, {})).totalPosts).toBe(0);

    const analyst = await addMember(ws.id, 'ANALYST');
    expect((await getBestTimes(analyst, {})).enough).toBe(true);
    await expect(addBestTimesToQueue(analyst, {})).rejects.toMatchObject({ status: 403 });

    const res = await addBestTimesToQueue(ctx, {});
    expect(res.added).toBe(2);
    const slots = await db.queueSlot.findMany({ where: { workspaceId: ws.id, dayOfWeek: 4, time: '19:00' } });
    expect(slots).toHaveLength(1);
    // Adding again doesn't duplicate.
    expect((await addBestTimesToQueue(ctx, {})).added).toBe(0);
  });
});
