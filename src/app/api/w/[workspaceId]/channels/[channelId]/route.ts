import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { disconnectChannel } from '@/server/services/channels';

type P = { workspaceId: string; channelId: string };

export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.manage');
  return disconnectChannel(ctx, params.channelId);
});
