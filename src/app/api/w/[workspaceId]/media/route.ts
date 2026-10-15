import { route, parseQuery } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { ingestUpload, listMedia, listMediaSchema, uploadLimits } from '@/server/services/media';
import { receiveUpload } from '@/server/media/upload';
import { enforceRateLimit } from '@/server/rate-limit';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'media.view');
  return listMedia(ctx, parseQuery(req, listMediaSchema));
});

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'media.upload');
  await enforceRateLimit(`upload:${ctx.user.id}`, 120, 60 * 60);
  const limits = uploadLimits();
  const temp = await receiveUpload(req, Math.max(limits.imageBytes, limits.videoBytes));
  return { media: await ingestUpload(ctx, temp) };
});
