'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, Spinner } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api-client';

/** Verification runs as a POST from the page (not on GET) so link scanners can't consume tokens. */
export function VerifyEmail({ token }: { token: string }) {
  const [state, setState] = useState<'pending' | 'done' | 'error'>('pending');
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api('/api/account/verify-email', { body: { token } })
      .then(() => setState('done'))
      .catch((err) => {
        setError(errorMessage(err));
        setState('error');
      });
  }, [token]);

  if (state === 'pending') {
    return (
      <div className="flex items-center gap-2 text-muted">
        <Spinner /> Verifying your email…
      </div>
    );
  }
  if (state === 'error') return <Alert variant="danger" title="Couldn't verify your email">{error}</Alert>;
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="success" title="Email verified">Thanks! Your email address is confirmed.</Alert>
      <Button asChild variant="primary" size="lg">
        <Link href="/app">Continue to SocialDesk</Link>
      </Button>
    </div>
  );
}
