import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { addBestTimesToQueue } from '@/server/services/best-time';

type P = { workspaceId: string };

/** Adds the recommended times (for the same filters) to the posting queue. */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'queue.manage');
  return addBestTimesToQueue(ctx, Object.fromEntries(req.nextUrl.searchParams));
});
