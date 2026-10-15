import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { retryFirstComment } from '@/server/publishing/first-comment';
import { getPost } from '@/server/services/posts';

type P = { workspaceId: string; versionId: string };

/** Posts (or re-tries) a published version's first comment. */
export const POST = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.publish');
  const { postId, outcome } = await retryFirstComment(ctx, params.versionId);
  return { outcome, post: await getPost(ctx, postId) };
});
