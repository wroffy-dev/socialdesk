import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { inviteMember, inviteSchema, listMembers } from '@/server/services/members';
import { enforceRateLimit } from '@/server/rate-limit';

type P = { workspaceId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'members.view');
  return listMembers(ctx);
});

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'members.manage');
  await enforceRateLimit(`invite:${ctx.user.id}`, 30, 60 * 60);
  return { invitation: await inviteMember(ctx, await parseJson(req, inviteSchema)) };
});
