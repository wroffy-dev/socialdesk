import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireSuperAdmin } from '@/server/auth/session';
import { setWorkspacePlan, setWorkspaceStatus } from '@/server/services/admin';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal('activate') }),
  z.object({ action: z.literal('set_plan'), planKey: z.string().min(1).max(40) }),
]);

export const POST = route<{ id: string }>(async (req, { params }) => {
  const admin = await requireSuperAdmin();
  const body = await parseJson(req, schema);
  if (body.action === 'set_plan') await setWorkspacePlan(admin, params.id, body.planKey);
  else return setWorkspaceStatus(admin, params.id, body.action === 'suspend' ? 'SUSPENDED' : 'ACTIVE', body.action === 'suspend' ? body.reason : undefined);
  return { ok: true };
});
