import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { createSavedReply, listSavedReplies, savedReplySchema } from '@/server/services/settings';

type P = { workspaceId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'community.view');
  return { replies: await listSavedReplies(ctx) };
});

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'savedReplies.manage');
  return { reply: await createSavedReply(ctx, await parseJson(req, savedReplySchema)) };
});
