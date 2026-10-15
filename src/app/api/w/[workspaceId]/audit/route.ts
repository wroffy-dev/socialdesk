import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { listAuditLog } from '@/server/services/settings';

type P = { workspaceId: string };

export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'audit.view');
  return listAuditLog(ctx, Object.fromEntries(req.nextUrl.searchParams));
});
