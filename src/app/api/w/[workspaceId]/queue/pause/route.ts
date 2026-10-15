import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { setQueuePaused } from '@/server/services/queue';

type P = { workspaceId: string };

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'queue.manage');
  const { paused } = await parseJson(req, z.object({ paused: z.boolean() }));
  return setQueuePaused(ctx, paused);
});
