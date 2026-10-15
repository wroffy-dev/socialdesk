import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';
import { handleMetaCallback } from '@/server/services/channels';
import { env } from '@/server/env';

const COOKIE = 'sd_meta_oauth';

/** Meta redirects here after Facebook Login. All checks happen in handleMetaCallback. */
export async function GET(req: NextRequest) {
  const appUrl = env().APP_URL;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${appUrl}/login`);
  const sp = req.nextUrl.searchParams;
  const result = await handleMetaCallback(
    user,
    { code: sp.get('code'), state: sp.get('state'), error: sp.get('error'), errorDescription: sp.get('error_description') },
    req.cookies.get(COOKIE)?.value,
  );
  const target = result.ok
    ? `${appUrl}/w/${result.slug}/channels/connect?pending=${result.pendingId}`
    : result.slug
      ? `${appUrl}/w/${result.slug}/channels?error=${encodeURIComponent(result.message)}`
      : `${appUrl}/app`;
  const res = NextResponse.redirect(target);
  res.cookies.delete({ name: COOKIE, path: '/api/oauth/meta' });
  return res;
}
