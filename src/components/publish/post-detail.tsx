'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, ExternalLink, MoreHorizontal, Pencil, RotateCw, ShieldQuestion, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { ChannelAvatar } from '@/components/platform-icon';
import { MediaThumb } from '@/components/media/media-thumb';
import { StatusBadge } from '@/components/posts/status-badge';
import { PostActionsMenu } from '@/components/posts/post-actions';
import { PostPreview } from '@/components/composer/preview';
import { api, errorMessage } from '@/lib/api-client';
import { PLATFORM_INFO } from '@/lib/platforms';
import { formatAgo, formatDateTime } from '@/lib/time';
import type { PostDto } from '@/server/services/posts';

type Version = PostDto['versions'][number];

export function PostDetail({
  post: initial,
  workspace,
  canEdit,
  canPublish,
}: {
  post: PostDto;
  workspace: { id: string; slug: string; timezone: string };
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [post, setPost] = useState(initial);
  useEffect(() => setPost(initial), [initial]);
  const tz = post.timezone ?? workspace.timezone;
  const base = `/w/${workspace.slug}`;
  const editable = ['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELLED'].includes(post.status) && !post.versions.some((v) => ['PUBLISHING', 'PUBLISHED', 'NEEDS_VERIFICATION'].includes(v.status));

  // Poll while something is in flight so the page reflects the worker's progress.
  const inFlight = post.versions.some((v) => v.status === 'PUBLISHING' || (v.status === 'SCHEDULED' && v.scheduledAt && new Date(v.scheduledAt).getTime() < Date.now() + 60_000));
  useEffect(() => {
    if (!inFlight) return;
    const t = window.setInterval(async () => {
      try {
        const res = await api<{ post: PostDto }>(`/api/w/${workspace.id}/posts/${post.id}`);
        setPost(res.post);
      } catch {
        /* ignore transient errors */
      }
    }, 4000);
    return () => window.clearInterval(t);
  }, [inFlight, post.id, workspace.id]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4 pt-5 sm:px-8 sm:pt-7">
        <Button variant="ghost" size="icon" onClick={() => (window.history.length > 1 ? router.back() : router.push(`${base}/publish`))} aria-label="Back">
          <ArrowLeft />
        </Button>
        <h1 className="page-title">Post details</h1>
        <StatusBadge status={post.status} />
        <div className="ml-auto flex items-center gap-2">
          {canEdit && editable && (
            <Button asChild variant="outline">
              <Link href={`${base}/compose/${post.id}`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
          <PostActionsMenu
            post={post}
            workspace={workspace}
            canEdit={canEdit}
            canPublish={canPublish}
            onChanged={() => router.refresh()}
            trigger={
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-6 px-5 pb-10 sm:px-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Card className="grid gap-x-6 gap-y-2 p-4 text-[13px] sm:grid-cols-2">
            <Meta label={post.status === 'DRAFT' ? 'Not scheduled' : post.publishMode === 'QUEUE' ? 'Queue slot' : 'Scheduled for'}>
              {post.scheduledAt ? formatDateTime(post.scheduledAt, tz) : '—'}
              {post.scheduledAt && <span className="text-muted"> ({tz})</span>}
            </Meta>
            <Meta label="Created">
              {formatAgo(post.createdAt)}
              {post.createdBy && ` by ${post.createdBy.name}`}
            </Meta>
            <Meta label="Last updated">{formatAgo(post.updatedAt)}</Meta>
            <Meta label="Tags">
              {post.tags.length === 0
                ? '—'
                : post.tags.map((t) => (
                    <span key={t.id} className="mr-1 inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-xs">
                      <span className="size-1.5 rounded-full" style={{ background: t.color }} />
                      {t.name}
                    </span>
                  ))}
            </Meta>
            {post.notes && (
              <div className="sm:col-span-2">
                <Meta label="Internal note">{post.notes}</Meta>
              </div>
            )}
          </Card>

          <h2 className="section-title">Channels</h2>
          {post.versions.length === 0 && <p className="text-[13px] text-muted">No channels selected.</p>}
          {post.versions.map((v) => (
            <VersionCard key={v.id} post={post} version={v} tz={tz} workspaceId={workspace.id} canPublish={canPublish} onChanged={setPost} />
          ))}
        </div>

        <aside className="flex flex-col gap-3">
          <h2 className="section-title">Preview</h2>
          {post.versions[0] ? (
            <PostPreview
              channel={{ ...post.versions[0].account, status: post.versions[0].account.status }}
              caption={post.versions[0].customized ? post.versions[0].caption : post.baseCaption}
              media={post.versions[0].customized ? post.versions[0].media : post.baseMedia}
              linkUrl={post.versions[0].customized ? post.versions[0].linkUrl : post.baseLinkUrl}
            />
          ) : (
            <p className="text-[13px] text-muted">Nothing to preview.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function VersionCard({
  post,
  version: v,
  tz,
  workspaceId,
  canPublish,
  onChanged,
}: {
  post: PostDto;
  version: Version;
  tz: string;
  workspaceId: string;
  canPublish: boolean;
  onChanged: (p: PostDto) => void;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const caption = v.customized ? v.caption : post.baseCaption;
  const media = v.customized ? v.media : post.baseMedia;

  const retry = async (force = false) => {
    if (force) {
      const ok = await confirm({
        title: 'Retry even though it may be live?',
        description: 'If the earlier attempt did publish, retrying will create a duplicate post. Check the channel first if you can.',
        confirmLabel: 'Retry anyway',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await api<{ post: PostDto }>(`/api/w/${workspaceId}/versions/${v.id}/retry`, { body: { force } });
      onChanged(res.post);
      toast.success('Retry queued');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ChannelAvatar name={v.account.name} avatarUrl={v.account.avatarUrl} platform={v.platform} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{v.account.username ?? v.account.name}</p>
          <p className="text-xs text-muted">
            {PLATFORM_INFO[v.platform].label} · {v.format.toLowerCase()}
            {v.customized && ' · customised'}
            {v.account.mode === 'MOCK' && (
              <Badge variant="warning" className="ml-1.5">
                Mock channel
              </Badge>
            )}
          </p>
        </div>
        <StatusBadge status={v.status} />
        {v.externalUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={v.externalUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> View post
            </a>
          </Button>
        )}
      </div>

      <div className="mt-3 flex gap-3">
        {media.length > 0 && (
          <div className="flex shrink-0 gap-1.5">
            {media.slice(0, 3).map((m) => (
              <MediaThumb key={m.id} media={m} className="size-14" />
            ))}
            {media.length > 3 && <span className="self-center text-xs text-muted">+{media.length - 3}</span>}
          </div>
        )}
        <p className="line-clamp-4 whitespace-pre-wrap text-[13px]">{caption || <span className="italic text-muted">No caption</span>}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {v.publishedAt ? (
          <span className="flex items-center gap-1 text-accent-ink">
            <CheckCircle2 className="size-3.5" /> Published {formatDateTime(v.publishedAt, tz)}
          </span>
        ) : v.scheduledAt ? (
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> {v.status === 'SCHEDULED' ? 'Publishes' : 'Was scheduled for'} {formatDateTime(v.scheduledAt, tz)}
          </span>
        ) : null}
        {v.attemptCount > 0 && <span>{v.attemptCount} attempt{v.attemptCount > 1 ? 's' : ''}</span>}
        {v.nextRetryAt && v.status === 'SCHEDULED' && <span>Automatic retry {formatDateTime(v.nextRetryAt, tz)}</span>}
      </div>

      {v.status === 'FAILED' && (
        <Alert
          variant="danger"
          className="mt-3"
          title="Publishing failed"
          action={
            canPublish && (
              <Button size="sm" variant="outline" onClick={() => retry(false)} loading={busy}>
                <RotateCw /> Retry
              </Button>
            )
          }
        >
          {v.lastError ?? 'Unknown error.'}
          {v.lastErrorCode && <span className="ml-1 font-mono text-2xs opacity-70">({v.lastErrorCode})</span>}
        </Alert>
      )}
      {v.status === 'NEEDS_VERIFICATION' && (
        <Alert
          variant="warning"
          className="mt-3"
          title="We couldn't confirm whether this was published"
          action={
            canPublish && (
              <Button size="sm" variant="outline" onClick={() => setVerifyOpen(true)}>
                <ShieldQuestion /> Resolve
              </Button>
            )
          }
        >
          {v.lastError ?? 'The platform did not respond in time.'} Check {v.account.name} before retrying so the post isn&apos;t duplicated.
        </Alert>
      )}

      {v.attempts.length > 0 && (
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer text-muted hover:text-fg">Publishing history</summary>
          <ol className="mt-2 flex flex-col gap-1.5 border-l border-line pl-3">
            {v.attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                {a.status === 'SUCCEEDED' ? (
                  <CheckCircle2 className="size-3.5 text-accent-ink" />
                ) : a.status === 'FAILED' ? (
                  <XCircle className="size-3.5 text-danger" />
                ) : (
                  <AlertTriangle className="size-3.5 text-warning" />
                )}
                <span className="font-medium">Attempt {a.attemptNumber}</span>
                <span className="text-muted">
                  {formatDateTime(a.startedAt, tz)} · {a.trigger}
                </span>
                {a.errorMessage && <span className="text-danger">{a.errorMessage}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}

      <VerifyDialog open={verifyOpen} onOpenChange={setVerifyOpen} version={v} workspaceId={workspaceId} onDone={onChanged} onRetry={() => retry(true)} />
    </Card>
  );
}

function VerifyDialog({
  open,
  onOpenChange,
  version,
  workspaceId,
  onDone,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  version: Version;
  workspaceId: string;
  onDone: (p: PostDto) => void;
  onRetry: () => void;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const resolve = async (outcome: 'published' | 'not_published') => {
    setBusy(true);
    try {
      const res = await api<{ post: PostDto }>(`/api/w/${workspaceId}/versions/${version.id}/resolve`, {
        body: { outcome, externalUrl: outcome === 'published' && url.trim() ? url.trim() : null },
      });
      onDone(res.post);
      onOpenChange(false);
      toast.success(outcome === 'published' ? 'Marked as published' : 'Marked as not published');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Did this post go live?</DialogTitle>
          <DialogDescription>Open {version.account.name} and check whether the post appears. Then tell us what you found.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium">Link to the live post (optional)</span>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </label>
        </DialogBody>
        <DialogFooter className="flex-wrap">
          <Button variant="outline" onClick={() => resolve('not_published')} loading={busy}>
            It&apos;s not there
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onRetry();
            }}
          >
            Retry anyway
          </Button>
          <Button variant="primary" onClick={() => resolve('published')} loading={busy}>
            It&apos;s live
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
