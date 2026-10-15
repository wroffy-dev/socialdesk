import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { changePassword } from '@/server/services/auth';
import { enforceRateLimit } from '@/server/rate-limit';

export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit(`change-password:${user.id}`, 10, 60 * 60);
  const body = await parseJson(req, z.object({ currentPassword: z.string().max(128), newPassword: z.string().max(128) }));
  await changePassword(user.id, body.currentPassword, body.newPassword);
  return { ok: true };
});
