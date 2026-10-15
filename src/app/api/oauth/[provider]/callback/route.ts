import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';
import { handleCallback } from '@/server/services/channels';
import { isProvider } from '@/server/integrations/providers';
import { env } from '@/server/env';

const OAUTH_COOKIE = 'sd_oauth';

/**
 * Each provider (meta, x, google, linkedin) redirects here after sign-in. All checks happen in
 * handleCallback.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const appUrl = env().APP_URL;
  if (!isProvider(provider)) return NextResponse.redirect(`${appUrl}/app`);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${appUrl}/login`);
  const sp = req.nextUrl.searchParams;
  const result = await handleCallback(
    provider,
    user,
    { code: sp.get('code'), state: sp.get('state'), error: sp.get('error'), errorDescription: sp.get('error_description') },
    req.cookies.get(OAUTH_COOKIE)?.value,
  );
  const target = result.ok
    ? `${appUrl}/w/${result.slug}/channels/connect?pending=${result.pendingId}`
    : result.slug
      ? `${appUrl}/w/${result.slug}/channels?error=${encodeURIComponent(result.message)}`
      : `${appUrl}/app`;
  const res = NextResponse.redirect(target);
  res.cookies.delete({ name: OAUTH_COOKIE, path: '/api/oauth' });
  return res;
}
