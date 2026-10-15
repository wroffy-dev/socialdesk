import { VerifyEmail } from '@/components/auth/verify-email';
import { Alert } from '@/components/ui/feedback';

export const metadata = { title: 'Verify your email' };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Verify your email</h1>
      {token ? <VerifyEmail token={token} /> : <Alert variant="danger">This verification link is incomplete. Open the link from your email again.</Alert>}
    </>
  );
}
