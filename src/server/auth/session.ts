import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '../db';
import { forbidden, unauthorized } from '../errors';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser(id: string) {
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      emailVerified: true,
      isSuperAdmin: true,
      status: true,
      timezone: true,
    },
  });
}

/** The signed-in user, or null. Cached for the duration of a request. */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await loadUser(session.user.id);
  if (!user || user.status !== 'ACTIVE') return null;
  return user;
});

/** For pages: redirects to /login when signed out. */
export async function requireUserPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** For route handlers: throws 401 when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export function requireVerifiedEmail(user: Pick<SessionUser, 'emailVerified'>) {
  if (!user.emailVerified) throw forbidden('Verify your email address before doing this.');
}

/**
 * Super-admin access is read from the database on every request; it is never taken from the
 * session token or anything the browser sends.
 */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) throw forbidden();
  return user;
}

/** For admin pages: non-admins get a 404 so the admin area isn't advertised. */
export async function requireSuperAdminPage(): Promise<SessionUser> {
  const user = await requireUserPage();
  if (!user.isSuperAdmin) {
    const { notFound } = await import('next/navigation');
    notFound();
  }
  return user;
}
