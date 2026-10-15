'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api-client';

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="danger">{error}</Alert>}
      <Button
        variant="primary"
        size="lg"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { workspace } = await api<{ workspace: { slug: string } }>('/api/invitations/accept', { body: { token } });
            router.replace(`/w/${workspace.slug}/home`);
            router.refresh();
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        Accept invitation
      </Button>
    </div>
  );
}
