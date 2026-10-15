import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { replaceSlots, slotsSchema } from '@/server/services/queue';

type P = { workspaceId: string };

export const PUT = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'queue.manage');
  return replaceSlots(ctx, await parseJson(req, slotsSchema));
});
