import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/forgot-form';

export const metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Forgot your password?</h1>
      <p className="mb-5 mt-1 text-[13px] text-muted">Enter your email and we&apos;ll send you a reset link.</p>
      <ForgotPasswordForm />
      <p className="mt-5 text-center text-[13px] text-muted">
        <Link href="/login" className="font-medium text-fg hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
