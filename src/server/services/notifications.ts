import { db } from '../db';
import { env } from '../env';
import { layout, sendMail } from '../mail';

/**
 * Emails owners/admins (and the post's author) who opted in when a channel version fails or
 * needs manual verification.
 */
export async function notifyPublishProblem(platformPostId: string) {
  const v = await db.platformPost.findUnique({
    where: { id: platformPostId },
    include: { socialAccount: { select: { name: true, platform: true } }, post: { select: { id: true, createdById: true, baseCaption: true } }, workspace: { select: { id: true, slug: true, name: true } } },
  });
  if (!v || (v.status !== 'FAILED' && v.status !== 'NEEDS_VERIFICATION')) return;
  const recipients = await db.workspaceMember.findMany({
    where: {
      workspaceId: v.workspaceId,
      OR: [{ role: { in: ['OWNER', 'ADMIN'] } }, ...(v.post.createdById ? [{ userId: v.post.createdById }] : [])],
      user: { status: 'ACTIVE', notificationPrefs: { some: { workspaceId: v.workspaceId, emailOnFailure: true } } },
    },
    select: { user: { select: { email: true } } },
  });
  if (recipients.length === 0) return;
  const url = `${env().APP_URL}/w/${v.workspace.slug}/publish/posts/${v.post.id}`;
  const verify = v.status === 'NEEDS_VERIFICATION';
  const subject = verify ? `Check whether your post went live on ${v.socialAccount.name}` : `A post failed to publish on ${v.socialAccount.name}`;
  const body = verify
    ? `We couldn't confirm whether a post in "${v.workspace.name}" was published to ${v.socialAccount.name}. Please check the channel and resolve it so it isn't duplicated.`
    : `A post in "${v.workspace.name}" could not be published to ${v.socialAccount.name}: ${v.lastError ?? 'unknown error'}.`;
  for (const r of recipients) {
    await sendMail({
      to: r.user.email,
      subject,
      text: `${body}\n\nOpen the post: ${url}`,
      html: layout({ heading: subject, body, actionLabel: 'Open post', actionUrl: url }),
    });
  }
}

/** Emails members who opted in when a version is published. */
export async function notifyPublished(platformPostId: string) {
  const v = await db.platformPost.findUnique({
    where: { id: platformPostId },
    include: { socialAccount: { select: { name: true } }, post: { select: { id: true } }, workspace: { select: { slug: true, name: true } } },
  });
  if (!v || v.status !== 'PUBLISHED') return;
  const recipients = await db.notificationPreference.findMany({
    where: { workspaceId: v.workspaceId, emailOnPublish: true, user: { status: 'ACTIVE', memberships: { some: { workspaceId: v.workspaceId } } } },
    select: { user: { select: { email: true } } },
  });
  const url = v.externalUrl ?? `${env().APP_URL}/w/${v.workspace.slug}/publish/posts/${v.post.id}`;
  for (const r of recipients) {
    const subject = `Published to ${v.socialAccount.name}`;
    const body = `A post in "${v.workspace.name}" was published to ${v.socialAccount.name}.`;
    await sendMail({ to: r.user.email, subject, text: `${body}\n\n${url}`, html: layout({ heading: subject, body, actionLabel: 'View post', actionUrl: url }) });
  }
}

/** Weekly summary for members who opted in. */
export async function sendWeeklyDigests(now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const weekAhead = new Date(now.getTime() + 7 * 24 * 3600_000);
  const workspaces = await db.workspace.findMany({ where: { status: 'ACTIVE' }, select: { id: true, slug: true, name: true } });
  let sent = 0;
  for (const ws of workspaces) {
    const recipients = await db.notificationPreference.findMany({
      where: { workspaceId: ws.id, emailWeeklyDigest: true, user: { status: 'ACTIVE', memberships: { some: { workspaceId: ws.id } } } },
      select: { user: { select: { email: true } } },
    });
    if (recipients.length === 0) continue;
    const [published, failed, upcoming] = await Promise.all([
      db.platformPost.count({ where: { workspaceId: ws.id, status: 'PUBLISHED', publishedAt: { gte: weekAgo } } }),
      db.platformPost.count({ where: { workspaceId: ws.id, status: { in: ['FAILED', 'NEEDS_VERIFICATION'] }, updatedAt: { gte: weekAgo } } }),
      db.platformPost.count({ where: { workspaceId: ws.id, status: 'SCHEDULED', scheduledAt: { gte: now, lt: weekAhead } } }),
    ]);
    if (published + failed + upcoming === 0) continue;
    const url = `${env().APP_URL}/w/${ws.slug}/home`;
    const body = `Last 7 days: ${published} published, ${failed} need attention. Next 7 days: ${upcoming} scheduled.`;
    for (const r of recipients) {
      await sendMail({
        to: r.user.email,
        subject: `Your week in ${ws.name}`,
        text: `${body}\n\n${url}`,
        html: layout({ heading: `Your week in ${ws.name}`, body, actionLabel: 'Open SocialDesk', actionUrl: url, footer: 'Turn off weekly summaries in Settings → Notifications.' }),
      });
      sent++;
    }
  }
  return { sent };
}
