import { can, type Permission, type Role } from '@/lib/permissions';
import { db } from '../db';
import { forbidden } from '../errors';

/** Everything a service needs to act inside one workspace on behalf of one user. */
export interface WorkspaceCtx {
  user: { id: string; email: string; name: string | null; emailVerified: Date | null };
  workspace: { id: string; slug: string; name: string; timezone: string; status: 'ACTIVE' | 'SUSPENDED'; logoUrl: string | null };
  role: Role;
}

/** Permissions still allowed while a workspace is suspended. */
const SUSPENDED_ALLOWED = new Set<Permission>([
  'workspace.view',
  'members.view',
  'channels.view',
  'posts.view',
  'media.view',
  'analytics.view',
  'community.view',
  'billing.view',
  'billing.manage',
  'audit.view',
]);

export function assertCan(ctx: WorkspaceCtx, permission: Permission) {
  if (!can(ctx.role, permission)) throw forbidden();
  if (ctx.workspace.status === 'SUSPENDED' && !SUSPENDED_ALLOWED.has(permission)) {
    throw forbidden('This workspace is suspended. Contact support to restore access.');
  }
}

export function hasPermission(ctx: WorkspaceCtx, permission: Permission) {
  try {
    assertCan(ctx, permission);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the workspace only through the user's membership. A workspace the user is not a
 * member of is reported as "not found" so its existence is not revealed.
 */
export async function loadCtx(user: WorkspaceCtx['user'], where: { id: string } | { slug: string }): Promise<WorkspaceCtx | null> {
  const membership = await db.workspaceMember.findFirst({
    where: { userId: user.id, workspace: where },
    select: {
      role: true,
      workspace: { select: { id: true, slug: true, name: true, timezone: true, status: true, logoUrl: true } },
    },
  });
  if (!membership) return null;
  return { user, workspace: membership.workspace, role: membership.role };
}

/** Builds a context directly (worker, tests, admin tooling). Still verifies membership. */
export async function workspaceCtxFor(userId: string, workspaceId: string): Promise<WorkspaceCtx | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, emailVerified: true } });
  if (!user) return null;
  return loadCtx(user, { id: workspaceId });
}
