import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { getMediaAsset } from '@/server/services/media';
import { serveStored } from '@/server/media/serve';
import { storage } from '@/server/storage';

type P = { workspaceId: string; mediaId: string };

/** Private file access: requires a session and membership of the owning workspace. */
export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'media.view');
  const asset = await getMediaAsset(ctx, params.mediaId);
  const wantsThumb = req.nextUrl.searchParams.get('variant') === 'thumb';
  if (wantsThumb && (await storage().size(`${asset.storageKey}.thumb.webp`)) !== null) {
    return serveStored(req, `${asset.storageKey}.thumb.webp`, 'image/webp', { cache: 'private, max-age=86400' });
  }
  return serveStored(req, asset.storageKey, asset.mimeType, { cache: 'private, max-age=3600', filename: asset.originalName });
});
