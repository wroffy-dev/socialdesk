import { db } from '../db';
import { hasPermission, type WorkspaceCtx } from '../auth/ctx';
import { nextFreeQueueSlot } from './queue';
import { listTags } from './tags';
import { getPost } from './posts';

/** Everything the composer page needs, loaded in one place. */
export async function getComposerData(ctx: WorkspaceCtx, postId: string | null) {
  const [projects, channels, tags, nextSlot, post] = await Promise.all([
    db.project.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, name: true, color: true } }),
    db.socialAccount.findMany({
      where: { workspaceId: ctx.workspace.id, status: { not: 'DISCONNECTED' } },
      orderBy: [{ platform: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, projectId: true, name: true, username: true, avatarUrl: true, platform: true, status: true },
    }),
    listTags(ctx),
    nextFreeQueueSlot(db, ctx.workspace.id, ctx.workspace.timezone, new Date(Date.now() + 60_000), postId ?? undefined),
    postId ? getPost(ctx, postId) : Promise.resolve(null),
  ]);
  return {
    workspace: { id: ctx.workspace.id, slug: ctx.workspace.slug, timezone: ctx.workspace.timezone },
    projects,
    channels,
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    nextQueueSlot: nextSlot?.toISOString() ?? null,
    post,
    canPublish: hasPermission(ctx, 'posts.publish'),
    canManageChannels: hasPermission(ctx, 'channels.manage'),
    canManageTags: hasPermission(ctx, 'tags.manage'),
  };
}
