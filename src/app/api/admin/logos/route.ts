import { route } from '@/server/http';
import { requireSuperAdmin } from '@/server/auth/session';
import { saveCustomerLogo } from '@/server/services/social-proof';

export const POST = route(async (req) => {
  const admin = await requireSuperAdmin();
  return saveCustomerLogo(admin, null, await req.json().catch(() => null));
});
