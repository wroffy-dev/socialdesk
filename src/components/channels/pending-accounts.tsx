'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { ChannelAvatar } from '@/components/platform-icon';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { getPendingConnection } from '@/server/services/channels';

type Data = Awaited<ReturnType<typeof getPendingConnection>>;

/** Pick the one account to link to the project slot the connection was started for. */
export function PendingAccounts({ data, pendingId, workspace }: { data: Data; pendingId: string; workspace: { id: string; slug: string } }) {
  const router = useRouter();
  const selectable = data.accounts.filter((a) => !a.blockedReason);
  const [picked, setPicked] = useState<string | null>(selectable.find((a) => a.connected)?.key ?? (selectable.length === 1 ? selectable[0]!.key : null));
  const [busy, setBusy] = useState(false);
  const noun = data.platform === 'FACEBOOK' ? 'Page' : 'account';

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await api<{ connected: number }>(`/api/w/${workspace.id}/channels/pending/${pendingId}`, { body: { key: picked } });
      router.push(`/w/${workspace.slug}/channels?connected=${res.connected}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4 px-5 pb-10 sm:px-8">
      {data.declined.length > 0 && (
        <Alert variant="warning" title="Some permissions were declined">
          {data.declined.join(', ')}. Features that need them will be unavailable. Reconnect and allow them to enable those features.
        </Alert>
      )}
      {data.current && (
        <Alert variant="info">
          {data.project.name} already has {data.current.name}. You can refresh its connection below; to link a different {data.platformLabel} {noun}, disconnect it first.
        </Alert>
      )}
      {data.accounts.length === 0 ? (
        <EmptyState
          title={`No ${data.platformLabel} ${noun}s found`}
          description={
            data.platform === 'INSTAGRAM'
              ? 'Make sure your Instagram account is a professional account linked to a Facebook Page, and that you selected that Page in the Facebook dialog.'
              : 'Make sure you selected your Pages in the Facebook dialog.'
          }
          action={<Button onClick={() => router.push(`/w/${workspace.slug}/channels`)}>Back to projects</Button>}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line" role="radiogroup" aria-label={`${data.platformLabel} ${noun}`}>
          {data.accounts.map((a) => {
            const on = picked === a.key;
            return (
              <li key={a.key}>
                <label className={cn('flex items-center gap-3 px-4 py-3', a.blockedReason ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-subtle')}>
                  <input
                    type="radio"
                    name="account"
                    className="size-4 accent-[rgb(var(--accent-ink))]"
                    checked={on}
                    disabled={!!a.blockedReason}
                    onChange={() => setPicked(a.key)}
                    aria-label={`Connect ${a.name}`}
                  />
                  <ChannelAvatar name={a.name} avatarUrl={a.avatarUrl} platform={a.platform} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.username ? `@${a.username}` : a.name}</span>
                    <span className="block text-xs text-muted">{a.blockedReason ?? data.platformLabel}</span>
                    {a.missingPermissions.length > 0 && !a.blockedReason && (
                      <span className="block truncate text-xs text-warning">Limited: {a.missingPermissions.join(', ')}</span>
                    )}
                  </span>
                  {a.connected && <Badge variant="success">Linked — will refresh</Badge>}
                  {!a.connected && a.reconnect && !a.blockedReason && <Badge>Previously connected</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/w/${workspace.slug}/channels`)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!picked} loading={busy} onClick={submit}>
          Link to {data.project.name}
        </Button>
      </div>
    </div>
  );
}
