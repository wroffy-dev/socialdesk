import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { SignupForm } from '@/components/auth/signup-form';

export const metadata = { title: 'Create your account' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const { next, email } = await searchParams;
  if (await getCurrentUser()) redirect(next ?? '/app');
  const signupsOpen = process.env.SIGNUPS_ENABLED !== 'false';
  return (
    <>
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mb-5 mt-1 text-[13px] text-muted">Free to start. No card required.</p>
      {signupsOpen ? (
        <SignupForm next={next ?? null} defaultEmail={email} />
      ) : (
        <p className="text-[13px] text-muted">Sign-ups are currently closed. Ask a workspace owner for an invitation.</p>
      )}
      <p className="mt-5 text-center text-[13px] text-muted">
        Already have an account?{' '}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-medium text-fg hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-faint">
        By creating an account you agree to the <Link href="/legal/terms" className="underline">Terms</Link> and{' '}
        <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </>
  );
}
