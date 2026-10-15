import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { checkChannel } from '@/server/services/channels';
import { enforceRateLimit } from '@/server/rate-limit';

type P = { workspaceId: string; channelId: string };

export const POST = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.view');
  await enforceRateLimit(`check:${params.channelId}`, 10, 60);
  return checkChannel(ctx, params.channelId);
});
