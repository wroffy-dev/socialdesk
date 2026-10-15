import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { logoKey, removeWorkspaceLogo, setWorkspaceLogo } from '@/server/services/settings';
import { serveStored } from '@/server/media/serve';
import { badRequest } from '@/server/errors';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { params }) => {
  await requireWorkspace(params.workspaceId);
  return serveStored(req, logoKey(params.workspaceId), 'image/webp', { cache: 'private, max-age=86400' });
});

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'workspace.update');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Choose an image.');
  if (file.size > 2 * 1024 * 1024) throw badRequest('Logos must be 2 MB or smaller.');
  return setWorkspaceLogo(ctx, Buffer.from(await file.arrayBuffer()));
});

export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'workspace.update');
  await removeWorkspaceLogo(ctx);
});
