import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { resendInvitation, revokeInvitation } from '@/server/services/members';
import { enforceRateLimit } from '@/server/rate-limit';

type P = { workspaceId: string; invitationId: string };

export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'members.manage');
  await revokeInvitation(ctx, params.invitationId);
});

export const POST = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'members.manage');
  await enforceRateLimit(`invite-resend:${params.invitationId}`, 3, 60 * 60);
  return { invitation: await resendInvitation(ctx, params.invitationId) };
});
