import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { listCalendar } from '@/server/services/posts';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.view');
  return listCalendar(ctx, Object.fromEntries(req.nextUrl.searchParams));
});
