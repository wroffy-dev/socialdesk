import { route, parseJson } from '@/server/http';
import { signup, signupSchema } from '@/server/services/auth';
import { enforceRateLimit } from '@/server/rate-limit';
import { clientIp } from '@/server/request';

export const POST = route(async (req) => {
  const ip = clientIp(req);
  await enforceRateLimit(`signup:${ip}`, 10, 60 * 60);
  const input = await parseJson(req, signupSchema);
  const user = await signup(input, ip);
  return { user: { id: user.id, email: user.email } };
});
