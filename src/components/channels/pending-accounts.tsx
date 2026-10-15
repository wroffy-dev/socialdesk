'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { ChannelAvatar } from '@/components/platform-icon';
import { api, errorMessage } from '@/lib/api-client';
import { PLATFORM_INFO } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import type { getPendingConnection } from '@/server/services/channels';

type Data = Awaited<ReturnType<typeof getPendingConnection>>;

export function PendingAccounts({ data, pendingId, workspace }: { data: Data; pendingId: string; workspace: { id: string; slug: string } }) {
  const router = useRouter();
  const selectable = data.accounts.filter((a) => !a.blockedReason);
  const [picked, setPicked] = useState<string[]>(selectable.filter((a) => a.reconnect).map((a) => a.key));
  const [busy, setBusy] = useState(false);
  const newCount = picked.filter((k) => !data.accounts.find((a) => a.key === k)?.connected).length;
  const over = data.limit !== null && data.used + newCount > data.limit;

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api<{ connected: number }>(`/api/w/${workspace.id}/channels/pending/${pendingId}`, { body: { keys: picked } });
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
      {data.accounts.length === 0 ? (
        <EmptyState
          title="No Pages or Instagram accounts found"
          description="Make sure you selected your Pages in the Facebook dialog, and that your Instagram account is a professional account linked to one of them."
          action={<Button onClick={() => router.push(`/w/${workspace.slug}/channels`)}>Back to channels</Button>}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {data.accounts.map((a) => {
            const on = picked.includes(a.key);
            return (
              <li key={a.key}>
                <label className={cn('flex items-center gap-3 px-4 py-3', a.blockedReason ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-subtle')}>
                  <Checkbox
                    checked={on}
                    disabled={!!a.blockedReason}
                    onCheckedChange={(v) => setPicked((cur) => (v ? [...cur, a.key] : cur.filter((k) => k !== a.key)))}
                    aria-label={`Connect ${a.name}`}
                  />
                  <ChannelAvatar name={a.name} avatarUrl={a.avatarUrl} platform={a.platform} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.username ? `@${a.username}` : a.name}</span>
                    <span className="block truncate text-xs text-muted">{a.blockedReason ?? PLATFORM_INFO[a.platform].label}</span>
                    {a.missingPermissions.length > 0 && !a.blockedReason && (
                      <span className="block truncate text-xs text-warning">Limited: {a.missingPermissions.join(', ')}</span>
                    )}
                  </span>
                  {a.connected && <Badge variant="success">Connected — will refresh</Badge>}
                  {!a.connected && a.reconnect && <Badge>Previously connected</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {over && (
        <Alert variant="warning">
          Your {data.planName} plan allows {data.limit} channels and you already use {data.used}. Select fewer accounts or upgrade.
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/w/${workspace.slug}/channels`)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={picked.length === 0 || over} loading={busy} onClick={submit}>
          Connect {picked.length || ''} account{picked.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}
