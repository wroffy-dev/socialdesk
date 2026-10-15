import { route } from '@/server/http';
import { requireSuperAdmin } from '@/server/auth/session';
import { listGlobalAudit } from '@/server/services/admin';

export const GET = route(async (req) => {
  await requireSuperAdmin();
  return listGlobalAudit(req.nextUrl.searchParams.get('cursor') ?? undefined);
});
