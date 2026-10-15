import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { moveInQueue } from '@/server/services/queue';

type P = { workspaceId: string };

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.publish');
  const { postId, direction } = await parseJson(req, z.object({ postId: z.string().min(1), direction: z.enum(['up', 'down']) }));
  return moveInQueue(ctx, postId, direction);
});
