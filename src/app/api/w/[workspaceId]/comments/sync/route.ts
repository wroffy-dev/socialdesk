import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { syncWorkspaceComments } from '@/server/services/community';
import { enforceRateLimit } from '@/server/rate-limit';

type P = { workspaceId: string };

export const POST = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'community.view');
  await enforceRateLimit(`comment-sync:${ctx.workspace.id}`, 4, 10 * 60);
  return syncWorkspaceComments(ctx);
});
