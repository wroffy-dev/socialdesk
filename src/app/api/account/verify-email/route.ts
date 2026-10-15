import { z } from 'zod';
import { route, parseJson } from '@/server/http';
import { verifyEmail } from '@/server/services/auth';
import { enforceRateLimit } from '@/server/rate-limit';
import { clientIp } from '@/server/request';

export const POST = route(async (req) => {
  await enforceRateLimit(`verify:${clientIp(req)}`, 30, 15 * 60);
  const { token } = await parseJson(req, z.object({ token: z.string().min(10).max(200) }));
  await verifyEmail(token);
  return { ok: true };
});
