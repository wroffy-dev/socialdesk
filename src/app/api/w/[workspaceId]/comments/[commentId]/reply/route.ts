import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { replyToComment } from '@/server/services/community';
import { enforceRateLimit } from '@/server/rate-limit';

type P = { workspaceId: string; commentId: string };

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'community.reply');
  await enforceRateLimit(`reply:${ctx.user.id}`, 60, 10 * 60);
  const { text } = await parseJson(req, z.object({ text: z.string().max(2000) }));
  return replyToComment(ctx, params.commentId, text);
});
