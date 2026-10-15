import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { confirmPendingConnection, confirmSchema, getPendingConnection } from '@/server/services/channels';

type P = { workspaceId: string; pendingId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.manage');
  return getPendingConnection(ctx, params.pendingId);
});

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.manage');
  const { key } = await parseJson(req, confirmSchema);
  return confirmPendingConnection(ctx, params.pendingId, key);
});
