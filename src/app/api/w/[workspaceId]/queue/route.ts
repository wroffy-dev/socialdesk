import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { getQueue } from '@/server/services/queue';

type P = { workspaceId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.view');
  return getQueue(ctx);
});
