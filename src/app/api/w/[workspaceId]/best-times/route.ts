import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { getBestTimes } from '@/server/services/best-time';

type P = { workspaceId: string };

/** Best times to post, from this workspace's own published posts. `?channels=a,b&projects=c`. */
export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'analytics.view');
  return getBestTimes(ctx, Object.fromEntries(req.nextUrl.searchParams));
});
