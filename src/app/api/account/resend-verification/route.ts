import { route } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { sendVerificationEmail } from '@/server/services/auth';
import { enforceRateLimit } from '@/server/rate-limit';

export const POST = route(async () => {
  const user = await requireUser();
  await enforceRateLimit(`resend-verify:${user.id}`, 3, 15 * 60);
  await sendVerificationEmail(user.id);
  return { ok: true };
});
