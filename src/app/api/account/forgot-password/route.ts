import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { requestPasswordReset } from '@/server/services/auth';
import { enforceRateLimit } from '@/server/rate-limit';
import { clientIp } from '@/server/request';

export const POST = route(async (req) => {
  const ip = clientIp(req);
  const { email } = await parseJson(req, z.object({ email: z.string().trim().toLowerCase().email().max(254) }));
  await enforceRateLimit(`forgot:ip:${ip}`, 10, 60 * 60);
  await enforceRateLimit(`forgot:email:${email}`, 3, 60 * 60);
  await requestPasswordReset(email, ip);
  // Same response whether or not the account exists.
  return { ok: true };
});
