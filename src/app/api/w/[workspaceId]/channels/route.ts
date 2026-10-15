import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { listChannels } from '@/server/services/channels';

type P = { workspaceId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.view');
  return listChannels(ctx);
});
