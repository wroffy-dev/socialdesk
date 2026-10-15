import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { deleteTag, tagSchema, updateTag } from '@/server/services/tags';

type P = { workspaceId: string; tagId: string };

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'tags.manage');
  return { tag: await updateTag(ctx, params.tagId, await parseJson(req, tagSchema)) };
});

export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'tags.manage');
  await deleteTag(ctx, params.tagId);
});
