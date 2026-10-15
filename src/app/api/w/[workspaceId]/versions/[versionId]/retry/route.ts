import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { retryVersion } from '@/server/services/posts';

type P = { workspaceId: string; versionId: string };

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.publish');
  const { force } = await parseJson(req, z.object({ force: z.boolean().default(false) }));
  return { post: await retryVersion(ctx, params.versionId, { force }) };
});
