import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { cancelPaidSubscription } from '@/server/services/billing';

type P = { workspaceId: string };

export const POST = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'billing.manage');
  await cancelPaidSubscription(ctx);
  return { ok: true };
});
