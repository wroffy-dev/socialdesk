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
