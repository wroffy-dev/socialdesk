import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { deleteSavedReply, savedReplySchema, updateSavedReply } from '@/server/services/settings';

type P = { workspaceId: string; replyId: string };

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'savedReplies.manage');
  return { reply: await updateSavedReply(ctx, params.replyId, await parseJson(req, savedReplySchema)) };
});

export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'savedReplies.manage');
  await deleteSavedReply(ctx, params.replyId);
});
