import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { duplicatePost } from '@/server/services/posts';

type P = { workspaceId: string; postId: string };

export const POST = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.edit');
  return { post: await duplicatePost(ctx, params.postId) };
});
