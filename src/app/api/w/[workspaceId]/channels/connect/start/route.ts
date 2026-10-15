import { NextResponse } from 'next/server';
import { route } from '@/server/http';
import { requireWorkspace } from '@/server/auth/workspace';
import { connectQuerySchema, startConnect } from '@/server/services/channels';
import { enforceRateLimit } from '@/server/rate-limit';
import { env } from '@/server/env';

type P = { workspaceId: string };

/**
 * Redirects the browser to the platform's sign-in (or straight to the callback in mock mode) to
 * fill one project slot: `?project=<id>&platform=INSTAGRAM|FACEBOOK|X|LINKEDIN|YOUTUBE`.
 */
export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireWorkspace(params.workspaceId, 'channels.manage');
  const q = connectQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  await enforceRateLimit(`connect:${ctx.user.id}`, 20, 15 * 60);
  const { state, redirectUrl } = await startConnect(ctx, q.project, q.platform);
  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set('sd_oauth', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().APP_URL.startsWith('https://'),
    path: '/api/oauth',
    maxAge: 600,
  });
  return res;
});
