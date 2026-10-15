import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { reschedulePost } from '@/server/services/posts';

type P = { workspaceId: string; postId: string };

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.publish');
  const { scheduledAt } = await parseJson(req, z.object({ scheduledAt: z.string().datetime({ offset: true }) }));
  return { post: await reschedulePost(ctx, params.postId, scheduledAt) };
});
