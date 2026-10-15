import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireSuperAdmin } from '@/server/auth/session';
import { revokeUserSessions, setUserStatus } from '@/server/services/admin';

export const POST = route<{ id: string }>(async (req, { params }) => {
  const admin = await requireSuperAdmin();
  const { action } = await parseJson(req, z.object({ action: z.enum(['suspend', 'activate', 'revoke_sessions']) }));
  if (action === 'revoke_sessions') await revokeUserSessions(admin, params.id);
  else await setUserStatus(admin, params.id, action === 'suspend' ? 'SUSPENDED' : 'ACTIVE');
  return { ok: true };
});
