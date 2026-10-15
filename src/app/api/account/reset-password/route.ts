import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { resetPassword } from '@/server/services/auth';
import { enforceRateLimit } from '@/server/rate-limit';
import { clientIp } from '@/server/request';

export const POST = route(async (req) => {
  const ip = clientIp(req);
  await enforceRateLimit(`reset:${ip}`, 20, 60 * 60);
  const { token, password } = await parseJson(req, z.object({ token: z.string().min(10).max(200), password: z.string().max(128) }));
  await resetPassword(token, password, ip);
  return { ok: true };
});
