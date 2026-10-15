import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { acceptInvitation } from '@/server/services/members';
import { enforceRateLimit } from '@/server/rate-limit';

export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit(`invite-accept:${user.id}`, 20, 15 * 60);
  const { token } = await parseJson(req, z.object({ token: z.string().min(10).max(200) }));
  const workspace = await acceptInvitation(user, token);
  return { workspace };
});
