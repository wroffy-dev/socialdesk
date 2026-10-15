import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { resolveVersion } from '@/server/services/posts';

type P = { workspaceId: string; versionId: string };

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'posts.publish');
  const body = await parseJson(
    req,
    z.object({ outcome: z.enum(['published', 'not_published']), externalUrl: z.string().url().max(2000).nullable().optional() }),
  );
  return { post: await resolveVersion(ctx, params.versionId, body.outcome, body.externalUrl) };
});
