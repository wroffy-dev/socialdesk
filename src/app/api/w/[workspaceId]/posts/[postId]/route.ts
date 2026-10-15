import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { deletePost, getPost, postInputSchema, updatePost } from '@/server/services/posts';

type P = { workspaceId: string; postId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.view');
  return { post: await getPost(ctx, params.postId) };
});

export const PUT = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.edit');
  const input = await parseJson(req, postInputSchema);
  return { post: await updatePost(ctx, params.postId, input) };
});

export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.edit');
  await deletePost(ctx, params.postId);
});
