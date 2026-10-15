import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { LoginForm } from '@/components/auth/login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect('/app');
  return (
    <>
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mb-5 mt-1 text-[13px] text-muted">Sign in to your SocialDesk account.</p>
      <LoginForm next={next ?? null} />
      <p className="mt-5 text-center text-[13px] text-muted">
        New here?{' '}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'} className="font-medium text-fg hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
