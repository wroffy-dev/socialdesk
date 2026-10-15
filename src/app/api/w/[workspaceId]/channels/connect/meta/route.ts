import { NextResponse } from 'next/server';
import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { startMetaConnect } from '@/server/services/channels';
import { enforceRateLimit } from '@/server/rate-limit';
import { env } from '@/server/env';

type P = { workspaceId: string };


/** Redirects the browser to Facebook Login (or straight to the callback in mock mode). */
export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.manage');
  await enforceRateLimit(`connect:${ctx.user.id}`, 20, 15 * 60);
  const { state, redirectUrl } = await startMetaConnect(ctx);
  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set('sd_meta_oauth', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().APP_URL.startsWith('https://'),
    path: '/api/oauth/meta',
    maxAge: 600,
  });
  return res;
});
