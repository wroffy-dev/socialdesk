import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/reset-form';
import { Alert } from '@/components/ui/feedback';

export const metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Choose a new password</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert variant="danger" title="Missing reset link">
          Open the link from your email, or <Link href="/forgot-password" className="underline">request a new one</Link>.
        </Alert>
      )}
    </>
  );
}
