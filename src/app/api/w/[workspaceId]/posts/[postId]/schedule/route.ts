import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { scheduleActionSchema, schedulePost } from '@/server/services/posts';

type P = { workspaceId: string; postId: string };

/** Schedule / queue / publish-now / unschedule an existing post without changing its content. */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.publish');
  const action = await parseJson(req, scheduleActionSchema);
  return { post: await schedulePost(ctx, params.postId, action) };
});
