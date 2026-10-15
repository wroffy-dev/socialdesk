import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { getBilling } from '@/server/services/billing';

type P = { workspaceId: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'billing.view');
  return getBilling(ctx);
});
