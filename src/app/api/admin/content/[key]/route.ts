import { route, parseJson } from '@/server/http';
import { requireSuperAdmin } from '@/server/auth/session';
import { contentSchema, updateSiteContent } from '@/server/services/admin';

export const PUT = route<{ key: string }>(async (req, { params }) => {
  const admin = await requireSuperAdmin();
  await updateSiteContent(admin, params.key, await parseJson(req, contentSchema));
  return { ok: true };
});
