import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { addCommentNote } from '@/server/services/community';

type P = { workspaceId: string; commentId: string };

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'community.view');
  const { body } = await parseJson(req, z.object({ body: z.string().max(2000) }));
  return addCommentNote(ctx, params.commentId, body);
});
