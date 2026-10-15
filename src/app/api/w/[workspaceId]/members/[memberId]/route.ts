import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { changeMemberRole, removeMember } from '@/server/services/members';
import { ROLES } from '@/lib/permissions';

type P = { workspaceId: string; memberId: string };

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'members.manage');
  const { role } = await parseJson(req, z.object({ role: z.enum(ROLES) }));
  return { member: await changeMemberRole(ctx, params.memberId, role) };
});

/** Removes a member, or lets a member leave (any role may remove themselves). */
export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'members.view');
  await removeMember(ctx, params.memberId);
});
