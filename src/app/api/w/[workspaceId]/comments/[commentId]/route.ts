import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { commentUpdateSchema, getCommentThread, updateComment } from '@/server/services/community';

type P = { workspaceId: string; commentId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'community.view');
  return getCommentThread(ctx, params.commentId);
});

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'community.reply');
  await updateComment(ctx, params.commentId, await parseJson(req, commentUpdateSchema));
  return { ok: true };
});
