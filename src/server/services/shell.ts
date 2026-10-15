import { db } from '../db';
import type { WorkspaceCtx } from '../auth/ctx';
import { permissionsFor } from '@/lib/permissions';
import { listUserWorkspaces } from './workspaces';
import { getWorkspacePlan } from './entitlements';

/** Data the sidebar needs on every workspace page. */
export async function getShellData(ctx: WorkspaceCtx, user: { isSuperAdmin: boolean; image: string | null }) {
  const wsId = ctx.workspace.id;
  const [workspaces, channels, perChannel, scheduled, unanswered, plan] = await Promise.all([
    listUserWorkspaces(ctx.user.id),
    db.socialAccount.findMany({
      where: { workspaceId: wsId, status: { not: 'DISCONNECTED' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, username: true, platform: true, avatarUrl: true, status: true },
    }),
    db.platformPost.groupBy({
      by: ['socialAccountId'],
      where: { workspaceId: wsId, status: 'SCHEDULED' },
      _count: { _all: true },
    }),
    db.socialPost.count({ where: { workspaceId: wsId, status: 'SCHEDULED' } }),
    db.comment.count({ where: { workspaceId: wsId, answered: false, isOwn: false, hidden: false } }),
    getWorkspacePlan(wsId),
  ]);
  const counts = new Map(perChannel.map((r) => [r.socialAccountId, r._count._all]));
  return {
    user: { ...ctx.user, image: user.image, isSuperAdmin: user.isSuperAdmin, emailVerified: !!ctx.user.emailVerified },
    workspace: { ...ctx.workspace, planName: plan.planName },
    role: ctx.role,
    permissions: permissionsFor(ctx.role),
    workspaces,
    channels: channels.map((c) => ({ ...c, scheduled: counts.get(c.id) ?? 0 })),
    counts: { scheduled, unanswered },
  };
}

export type ShellData = Awaited<ReturnType<typeof getShellData>>;
