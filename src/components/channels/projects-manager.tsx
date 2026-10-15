'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, FolderPlus, MoreHorizontal, Pencil, Plug, RefreshCw, ShieldAlert, Trash2, TriangleAlert, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/feedback';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm';
import { ChannelAvatar, PlatformIcon } from '@/components/platform-icon';
import { connectHref } from './connect-dialog';
import { api, errorMessage } from '@/lib/api-client';
import { formatAgo } from '@/lib/time';
import { ACCOUNT_NOUN, COMING_SOON, PLATFORMS, PLATFORM_INFO } from '@/lib/platforms';
import type { ProjectList } from '@/server/services/projects';

type Project = ProjectList['projects'][number];
type Channel = NonNullable<Project['slots'][keyof Project['slots']]>;

const MODE_BADGE = {
  MOCK: { label: 'Mock', variant: 'warning' as const, hint: 'Simulated channel for local testing. Nothing is ever published.' },
  DEVELOPMENT: { label: 'Development', variant: 'info' as const, hint: 'Connected while the Meta app is in Development mode.' },
  LIVE: { label: 'Live', variant: 'success' as const, hint: 'Connected through the platform’s live app.' },
};

export function ProjectsManager({
  initial,
  workspace,
  canManage,
  emailVerified,
  error,
  connected,
  openNew,
}: {
  initial: ProjectList;
  workspace: { id: string; slug: string };
  canManage: boolean;
  emailVerified: boolean;
  error: string | null;
  connected: number | null;
  openNew: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState<{ id: string | null; name: string } | null>(null);
  useEffect(() => setData(initial), [initial]);
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current || (!connected && !openNew)) return;
    announced.current = true;
    if (connected) toast.success('Channel connected');
    if (openNew && canManage) setEditing({ id: null, name: '' });
    router.replace(`/w/${workspace.slug}/channels`, { scroll: false });
  }, [connected, openNew, canManage, router, workspace.slug]);

  const reload = async () => {
    setData(await api<ProjectList>(`/api/w/${workspace.id}/projects`));
    router.refresh();
  };

  const atLimit = data.limit !== null && data.used >= data.limit;

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) await api(`/api/w/${workspace.id}/projects/${editing.id}`, { method: 'PATCH', body: { name: editing.name } });
      else await api(`/api/w/${workspace.id}/projects`, { body: { name: editing.name } });
      toast.success(editing.id ? 'Project renamed' : 'Project created');
      setEditing(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async (p: Project) => {
    if (Object.values(p.slots).some(Boolean)) {
      toast.error('Disconnect this project’s channels before deleting it.');
      return;
    }
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      description: p.postCount > 0 ? `Its ${p.postCount} post${p.postCount > 1 ? 's' : ''} will be deleted too. This can't be undone.` : "This can't be undone.",
      confirmLabel: 'Delete project',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/api/w/${workspace.id}/projects/${p.id}`, { method: 'DELETE' });
      toast.success('Project deleted');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 px-5 pb-10 sm:px-8">
      {error && <Alert variant="danger" title="Couldn't connect">{error}</Alert>}
      {data.mode === 'MOCK' && (
        <Alert variant="warning" title="Mock mode">
          META_MODE is set to <code>mock</code>. Connecting creates simulated channels on every platform and publishing never reaches a real network. Configure the platform apps to connect real accounts.
        </Alert>
      )}
      {data.mode === 'DEVELOPMENT' && (
        <Alert variant="info" title="Meta app in Development mode">
          Only people with a role on your Meta app (admins, developers, testers) can connect their accounts. Switch to Live after App Review to open this to all users.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-muted">
          {data.used} of {data.limit ?? 'unlimited'} projects used on the {data.planName} plan · each project links one account per platform
        </p>
        {canManage && (
          <Button
            variant="primary"
            className="ml-auto"
            onClick={() => setEditing({ id: null, name: '' })}
            disabled={atLimit}
            title={atLimit ? 'Upgrade your plan to add more projects' : undefined}
          >
            <FolderPlus /> New project
          </Button>
        )}
      </div>
      {atLimit && canManage && (
        <p className="-mt-2 text-[13px] text-muted">
          Project limit reached.{' '}
          <a className="text-accent-ink underline" href={`/w/${workspace.slug}/settings/billing`}>
            Upgrade
          </a>{' '}
          to add more.
        </p>
      )}

      <div className="grid gap-4 2xl:grid-cols-2">
        {data.projects.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3 p-4" data-testid="project-card">
            <div className="flex items-center gap-2.5">
              <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} />
              <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.name}</h2>
              <span className="text-xs text-muted">
                {p.postCount} post{p.postCount === 1 ? '' : 's'}
              </span>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`${p.name} actions`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing({ id: p.id, name: p.name })}>
                      <Pencil /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => remove(p)} disabled={data.projects.length <= 1}>
                      <Trash2 /> Delete project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {PLATFORMS.map((platform) => {
              const ch = p.slots[platform];
              const available = data.available[platform];
              return ch ? (
                <ChannelSlot key={platform} channel={ch} workspace={workspace} projectId={p.id} canManage={canManage} onChanged={reload} />
              ) : (
                <div key={platform} className="flex items-center gap-3 rounded-lg border border-dashed border-line p-3">
                  <PlatformIcon platform={platform} size={32} muted />
                  <span className="min-w-0 flex-1 text-[13px] text-muted">
                    {available ? `No ${ACCOUNT_NOUN[platform]} linked` : `${PLATFORM_INFO[platform].label}: not set up on this server yet`}
                  </span>
                  {canManage && available && (
                    <Button asChild={emailVerified} size="sm" variant="outline" disabled={!emailVerified} title={emailVerified ? undefined : 'Verify your email first'}>
                      {emailVerified ? (
                        <a href={connectHref(workspace.id, p.id, platform)}>
                          <Plug /> Connect
                        </a>
                      ) : (
                        <>
                          <Plug /> Connect
                        </>
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </Card>
        ))}
      </div>

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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing?.id ? 'Rename project' : 'New project'}</DialogTitle>
              {!editing?.id && <DialogDescription>A brand or client. You can link one account per platform to it.</DialogDescription>}
            </DialogHeader>
            <DialogBody>
              <Input
                autoFocus
                aria-label="Project name"
                placeholder="e.g. Sunrise Café"
                maxLength={60}
                value={editing?.name ?? ''}
                onChange={(e) => setEditing((cur) => (cur ? { ...cur, name: e.target.value } : cur))}
              />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!editing?.name.trim()}>
                {editing?.id ? 'Save' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChannelSlot({
  channel: c,
  workspace,
  projectId,
  canManage,
  onChanged,
}: {
  channel: Channel;
  workspace: { id: string; slug: string };
  projectId: string;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [checking, setChecking] = useState(false);
  const mode = MODE_BADGE[c.mode];

  const check = async () => {
    setChecking(true);
    try {
      const res = await api<{ ok: boolean; message?: string }>(`/api/w/${workspace.id}/channels/${c.id}/check`, { method: 'POST' });
      if (res.ok) toast.success('Connection is working');
      else toast.error(res.message ?? 'Connection problem');
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const disconnect = async () => {
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
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex items-start gap-3">
        <ChannelAvatar name={c.name} avatarUrl={c.avatarUrl} platform={c.platform} size={36} />
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
            <DropdownMenuItem onSelect={check} disabled={checking}>
              <RefreshCw /> Check connection
            </DropdownMenuItem>
            {canManage && (
              <>
                <DropdownMenuItem asChild>
                  <a href={connectHref(workspace.id, projectId, c.platform)}>
                    <Plug /> Reconnect
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={disconnect}>
                  <Unplug /> Disconnect
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {c.lastError && <p className="rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{c.lastError}</p>}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Details</summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
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
          <>
            <p className="mt-2 text-muted">Limited features:</p>
            <ul className="list-disc pl-4 text-muted">
              {c.capabilities.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
      </details>
    </div>
  );
}
