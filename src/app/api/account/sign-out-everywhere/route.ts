import { route } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { signOutEverywhere } from '@/server/services/auth';

export const POST = route(async () => {
  const user = await requireUser();
  await signOutEverywhere(user.id);
  return { ok: true };
});
