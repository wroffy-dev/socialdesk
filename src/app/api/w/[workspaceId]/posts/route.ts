import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { createPost, listPosts, postInputSchema } from '@/server/services/posts';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.view');
  return listPosts(ctx, Object.fromEntries(req.nextUrl.searchParams));
});

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.edit');
  const input = await parseJson(req, postInputSchema);
  return { post: await createPost(ctx, input) };
});
