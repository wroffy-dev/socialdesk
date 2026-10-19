import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { startCheckout } from '@/server/services/billing';
import { enforceRateLimit } from '@/server/rate-limit';
import { BILLING_INTERVALS } from '@/lib/pricing';

type P = { workspaceId: string };

export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'billing.manage');
  await enforceRateLimit(`checkout:${ctx.workspace.id}`, 10, 60 * 60);
  const { planKey, interval } = await parseJson(req, z.object({ planKey: z.string().min(1).max(40), interval: z.enum(BILLING_INTERVALS).default('month') }));
  return startCheckout(ctx, planKey, interval);
});
