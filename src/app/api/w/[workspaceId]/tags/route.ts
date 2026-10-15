import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { createTag, listTags, tagSchema } from '@/server/services/tags';

type P = { workspaceId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.view');
  return { tags: await listTags(ctx) };
});

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'tags.manage');
  return { tag: await createTag(ctx, await parseJson(req, tagSchema)) };
});
