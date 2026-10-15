import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { deleteMedia, getMediaAsset, toDto, updateMediaAlt } from '@/server/services/media';

type P = { workspaceId: string; mediaId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'media.view');
  return { media: toDto(await getMediaAsset(ctx, params.mediaId)) };
});

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'media.upload');
  const { altText } = await parseJson(req, z.object({ altText: z.string().max(500).nullable() }));
  return { media: await updateMediaAlt(ctx, params.mediaId, altText) };
});

export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'media.delete');
  await deleteMedia(ctx, params.mediaId);
});
