import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { listComments } from '@/server/services/community';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'community.view');
  return listComments(ctx, Object.fromEntries(req.nextUrl.searchParams));
});
