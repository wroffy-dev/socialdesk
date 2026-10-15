'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, MoreHorizontal, Plug, RefreshCw, ShieldAlert, TriangleAlert, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm';
import { ChannelAvatar, PlatformIcon } from '@/components/platform-icon';
import { useConnectDialog } from './connect-dialog';
import { api, errorMessage } from '@/lib/api-client';
import { formatAgo } from '@/lib/time';
import { COMING_SOON, PLATFORM_INFO } from '@/lib/platforms';
import type { listChannels } from '@/server/services/channels';

type Data = Awaited<ReturnType<typeof listChannels>>;

const MODE_BADGE = {
  MOCK: { label: 'Mock', variant: 'warning' as const, hint: 'Simulated channel for local testing. Nothing is ever published.' },
  DEVELOPMENT: { label: 'Development', variant: 'info' as const, hint: 'Connected while the Meta app is in Development mode.' },
  LIVE: { label: 'Live', variant: 'success' as const, hint: 'Connected through the approved Meta app.' },
};

export function ChannelsManager({
  initial,
  workspace,
  canManage,
  error,
  connected,
}: {
  initial: Data;
  workspace: { id: string; slug: string };
  canManage: boolean;
  error: string | null;
  connected: number | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const connect = useConnectDialog();
  const [data, setData] = useState(initial);
  const [checking, setChecking] = useState<string | null>(null);
  useEffect(() => setData(initial), [initial]);
  const announced = useRef(false);
  useEffect(() => {
    if (!connected || announced.current) return;
    announced.current = true;
    toast.success(`${connected} channel${connected > 1 ? 's' : ''} connected`);
    router.replace(`/w/${workspace.slug}/channels`, { scroll: false });
  }, [connected, router, workspace.slug]);

  const reload = async () => {
    setData(await api<Data>(`/api/w/${workspace.id}/channels`));
    router.refresh();
  };

  const check = async (id: string) => {
    setChecking(id);
    try {
      const res = await api<{ ok: boolean; message?: string }>(`/api/w/${workspace.id}/channels/${id}/check`, { method: 'POST' });
      if (res.ok) toast.success('Connection is working');
      else toast.error(res.message ?? 'Connection problem');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(null);
    }
  };

  const disconnect = async (c: Data['channels'][number]) => {
    const ok = await confirm({
      title: `Disconnect ${c.username ?? c.name}?`,
      description: (
        <>
          The stored access token is deleted.
          {c.scheduledCount > 0 && ` ${c.scheduledCount} scheduled post${c.scheduledCount > 1 ? 's' : ''} for this channel will be cancelled.`} Published posts stay in your history.
        </>
      ),
      confirmLabel: 'Disconnect',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/api/w/${workspace.id}/channels/${c.id}`, { method: 'DELETE' });
      toast.success('Channel disconnected');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const used = data.channels.length;
  return (
    <div className="flex flex-col gap-4 px-5 pb-10 sm:px-8">
      {error && <Alert variant="danger" title="Couldn't connect">{error}</Alert>}
      {data.mode === 'MOCK' && (
        <Alert variant="warning" title="Mock mode">
          META_MODE is set to <code>mock</code>. Connecting creates simulated channels and publishing never reaches Instagram or Facebook. Configure a Meta app to connect real accounts.
        </Alert>
      )}
      {data.mode === 'DEVELOPMENT' && (
        <Alert variant="info" title="Meta app in Development mode">
          Only people with a role on your Meta app (admins, developers, testers) can connect their accounts. Switch to Live after App Review to open this to all users.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-muted">
          {used} of {data.limit ?? 'unlimited'} channels used on the {data.planName} plan
        </p>
        {canManage && (
          <Button variant="primary" className="ml-auto" onClick={connect.open} disabled={data.limit !== null && used >= data.limit}>
            <Plug /> Connect channel
          </Button>
        )}
      </div>

      {data.channels.length === 0 ? (
        <EmptyState
          icon={<Plug />}
          title="No channels connected"
          description="Connect an Instagram professional account or a Facebook Page to start publishing."
          action={canManage && <Button variant="primary" onClick={connect.open}>Connect a channel</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.channels.map((c) => {
            const mode = MODE_BADGE[c.mode];
            return (
              <Card key={c.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <ChannelAvatar name={c.name} avatarUrl={c.avatarUrl} platform={c.platform} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.username ? `@${c.username}` : c.name}</p>
                    <p className="truncate text-xs text-muted">
                      {PLATFORM_INFO[c.platform].label}
                      {c.platform === 'INSTAGRAM' && c.pageName && ` · via ${c.pageName}`}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {c.status === 'CONNECTED' ? (
                        <Badge variant="success">
                          <CheckCircle2 className="size-3" /> Connected
                        </Badge>
                      ) : c.status === 'NEEDS_REAUTH' ? (
                        <Badge variant="danger">
                          <ShieldAlert className="size-3" /> Reconnect needed
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <TriangleAlert className="size-3" /> Error
                        </Badge>
                      )}
                      <Badge variant={mode.variant} title={mode.hint}>
                        {mode.label}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Channel actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => check(c.id)} disabled={checking === c.id}>
                        <RefreshCw /> Check connection
                      </DropdownMenuItem>
                      {canManage && (
                        <>
                          <DropdownMenuItem onSelect={connect.open}>
                            <Plug /> Reconnect
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => disconnect(c)}>
                            <Unplug /> Disconnect
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {c.lastError && <p className="rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{c.lastError}</p>}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted">Publishing</dt>
                  <dd>{c.capabilities.publish ? c.capabilities.formats.map((f) => f.toLowerCase()).join(', ') : 'Not permitted'}</dd>
                  <dt className="text-muted">Analytics</dt>
                  <dd>{c.capabilities.analytics ? 'Available' : 'Unavailable'}</dd>
                  <dt className="text-muted">Comments</dt>
                  <dd>{c.capabilities.comments ? (c.capabilities.replyToComments ? 'Read & reply' : 'Read only') : 'Unavailable'}</dd>
                  <dt className="text-muted">Scheduled posts</dt>
                  <dd>{c.scheduledCount}</dd>
                  <dt className="text-muted">Connected</dt>
                  <dd>
                    {formatAgo(c.createdAt)}
                    {c.connectedBy && ` by ${c.connectedBy}`}
                  </dd>
                  <dt className="text-muted">Last checked</dt>
                  <dd>{c.lastCheckedAt ? formatAgo(c.lastCheckedAt) : 'Never'}</dd>
                </dl>
                {c.capabilities.missing.length > 0 && (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer">Limited features ({c.capabilities.missing.length})</summary>
                    <ul className="mt-1 list-disc pl-4">
                      {c.capabilities.missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-2">
        <h2 className="section-title mb-2">Coming soon</h2>
        <div className="flex flex-wrap gap-2">
          {COMING_SOON.map((p) => (
            <span key={p.key} className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-[13px] text-muted">
              <PlatformIcon platform={p.key} size={18} muted /> {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
