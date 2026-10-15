import { route, parseJson } from '@/server/http';
import { requireSuperAdmin } from '@/server/auth/session';
import { planUpdateSchema, updatePlan } from '@/server/services/admin';

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const admin = await requireSuperAdmin();
  await updatePlan(admin, params.id, await parseJson(req, planUpdateSchema));
  return { ok: true };
});
