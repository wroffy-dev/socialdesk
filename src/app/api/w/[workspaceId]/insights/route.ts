import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { getInsights } from '@/server/services/insights';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'analytics.view');
  return getInsights(ctx, Object.fromEntries(req.nextUrl.searchParams));
});
