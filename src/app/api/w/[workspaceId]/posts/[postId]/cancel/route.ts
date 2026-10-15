import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { cancelPost } from '@/server/services/posts';

type P = { workspaceId: string; postId: string };

/** `toDraft: true` unschedules back to a draft; otherwise the post is cancelled. */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.publish');
  const { toDraft } = await parseJson(req, z.object({ toDraft: z.boolean().default(false) }));
  return { post: await cancelPost(ctx, params.postId, toDraft) };
});
