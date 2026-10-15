'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Film, Grid2x2, Image as ImageIcon, List, Search, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useConfirm } from '@/components/ui/confirm';
import { api, errorMessage } from '@/lib/api-client';
import { cn, formatBytes } from '@/lib/utils';
import { formatAgo } from '@/lib/time';
import type { MediaDto } from '@/server/services/media';
import { formatDuration, MediaThumb } from './media-thumb';
import { useUpload } from './use-upload';
import { UploadProgress } from './upload-progress';
import { ACCEPT } from './media-picker';

type Item = MediaDto & { uploadedBy: string | null; usageCount: number };
type Kind = '' | 'IMAGE' | 'VIDEO';

export function MediaLibrary({
  workspaceId,
  canUpload,
  canDelete,
  autoOpenUpload,
  limits,
}: {
  workspaceId: string;
  canUpload: boolean;
  canDelete: boolean;
  autoOpenUpload: boolean;
  limits: { imageMb: number; videoMb: number };
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<Item | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { items: uploads, upload, dismiss } = useUpload(workspaceId);
  const confirm = useConfirm();
  const [dragging, setDragging] = useState(false);

  const fetchPage = useCallback(
    async (after: string | null) => {
      const params = new URLSearchParams({ take: '48' });
      if (query) params.set('q', query);
      if (kind) params.set('kind', kind);
      if (after) params.set('cursor', after);
      return api<{ items: Item[]; nextCursor: string | null }>(`/api/w/${workspaceId}/media?${params}`);
    },
    [workspaceId, query, kind],
  );

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetchPage(null)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setCursor(res.nextCursor);
      })
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (autoOpenUpload && canUpload) fileRef.current?.click();
  }, [autoOpenUpload, canUpload]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const added = await upload(Array.from(files));
    if (added.length) {
      toast.success(`${added.length} file${added.length > 1 ? 's' : ''} uploaded`);
      setItems((cur) => [...added.map((m) => ({ ...m, uploadedBy: 'You', usageCount: 0 })), ...(cur ?? [])]);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const remove = async (item: Item) => {
    const ok = await confirm({
      title: `Delete ${item.originalName}?`,
      description: 'The file is removed from the library. Posts that were already published are not affected.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/api/w/${workspaceId}/media/${item.id}`, { method: 'DELETE' });
      setItems((cur) => cur?.filter((i) => i.id !== item.id) ?? null);
      setSelected(null);
      toast.success('File deleted');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div
      className="flex flex-col gap-4 px-5 pb-10 sm:px-8"
      onDragOver={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragging(false);
        void onFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files" className="pl-8" aria-label="Search files" />
        </div>
        <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Filter by type">
          {(
            [
              ['', 'All'],
              ['IMAGE', 'Images'],
              ['VIDEO', 'Videos'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn('rounded px-2.5 py-1 text-[13px]', kind === k ? 'bg-accent-soft font-medium text-accent-ink' : 'text-muted hover:text-fg')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="View">
            <button onClick={() => setView('grid')} aria-pressed={view === 'grid'} className={cn('rounded p-1.5', view === 'grid' ? 'bg-accent-soft text-accent-ink' : 'text-muted')} aria-label="Grid view">
              <Grid2x2 className="size-4" />
            </button>
            <button onClick={() => setView('list')} aria-pressed={view === 'list'} className={cn('rounded p-1.5', view === 'list' ? 'bg-accent-soft text-accent-ink' : 'text-muted')} aria-label="List view">
              <List className="size-4" />
            </button>
          </div>
          {canUpload && (
            <Button variant="primary" onClick={() => fileRef.current?.click()}>
              <Upload /> Upload
            </Button>
          )}
          <input ref={fileRef} type="file" hidden multiple accept={ACCEPT} onChange={(e) => void onFiles(e.target.files)} />
        </div>
      </div>

      {canUpload && <p className="-mt-2 text-xs text-muted">Images up to {limits.imageMb} MB, videos (MP4/MOV) up to {limits.videoMb} MB. Drag files anywhere here to upload.</p>}
      <UploadProgress items={uploads} onDismiss={dismiss} />
      {dragging && <div className="rounded-lg border-2 border-dashed border-accent-ink bg-accent-soft py-6 text-center text-[13px] text-accent-ink">Drop to upload</div>}

      {items === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ImageIcon />}
          title={query || kind ? 'No files match' : 'No media yet'}
          description={query || kind ? 'Try a different search or filter.' : 'Upload images and videos to reuse them across posts.'}
          action={canUpload && !query && !kind && <Button variant="primary" onClick={() => fileRef.current?.click()}><Upload /> Upload files</Button>}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((m) => (
            <button key={m.id} onClick={() => setSelected(m)} className="group flex flex-col gap-1.5 text-left">
              <MediaThumb media={m} className="aspect-square w-full ring-1 ring-line transition-shadow group-hover:ring-2 group-hover:ring-line-strong" rounded="lg" />
              <span className="truncate text-xs text-muted">{m.originalName}</span>
            </button>
          ))}
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-14" />
              <TH>Name</TH>
              <TH>Type</TH>
              <TH>Size</TH>
              <TH>Dimensions</TH>
              <TH>Uploaded</TH>
              <TH>Used in</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((m) => (
              <TR key={m.id} className="cursor-pointer hover:bg-subtle" onClick={() => setSelected(m)}>
                <TD>
                  <MediaThumb media={m} className="size-10" />
                </TD>
                <TD className="max-w-[260px] truncate font-medium">{m.originalName}</TD>
                <TD className="text-muted">
                  {m.kind === 'VIDEO' ? <Film className="inline size-4" /> : <ImageIcon className="inline size-4" />} {m.mimeType.split('/')[1]?.toUpperCase()}
                </TD>
                <TD className="text-muted">{formatBytes(m.sizeBytes)}</TD>
                <TD className="text-muted">{m.width && m.height ? `${m.width}×${m.height}` : '—'}</TD>
                <TD className="text-muted">{formatAgo(m.createdAt)}</TD>
                <TD className="text-muted">{m.usageCount ? `${m.usageCount} post${m.usageCount > 1 ? 's' : ''}` : '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {cursor && items && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            loading={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              try {
                const res = await fetchPage(cursor);
                setItems((cur) => [...(cur ?? []), ...res.items]);
                setCursor(res.nextCursor);
              } finally {
                setLoadingMore(false);
              }
            }}
          >
            Load more
          </Button>
        </div>
      )}

      <MediaDetail
        item={selected}
        workspaceId={workspaceId}
        canEdit={canUpload}
        canDelete={canDelete}
        onClose={() => setSelected(null)}
        onDelete={remove}
        onUpdated={(m) => setItems((cur) => cur?.map((i) => (i.id === m.id ? { ...i, ...m } : i)) ?? null)}
      />
    </div>
  );
}

function MediaDetail({
  item,
  workspaceId,
  canEdit,
  canDelete,
  onClose,
  onDelete,
  onUpdated,
}: {
  item: Item | null;
  workspaceId: string;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onDelete: (i: Item) => void;
  onUpdated: (m: MediaDto) => void;
}) {
  const [alt, setAlt] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setAlt(item?.altText ?? ''), [item]);
  if (!item) return null;
  const rows: [string, string][] = [
    ['Type', item.mimeType],
    ['Size', formatBytes(item.sizeBytes)],
    ['Dimensions', item.width && item.height ? `${item.width} × ${item.height}px` : 'Unknown'],
    ...(item.durationSec ? ([['Duration', formatDuration(item.durationSec)]] as [string, string][]) : []),
    ['Uploaded', `${formatAgo(item.createdAt)}${item.uploadedBy ? ` by ${item.uploadedBy}` : ''}`],
    ['Used in', item.usageCount ? `${item.usageCount} post version${item.usageCount > 1 ? 's' : ''}` : 'Not used yet'],
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{item.originalName}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-lg bg-subtle">
            {item.kind === 'IMAGE' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt={item.altText ?? ''} className="max-h-[60vh] object-contain" />
            ) : (
              <video src={item.url} controls className="max-h-[60vh] w-full" />
            )}
          </div>
          <div className="flex flex-col gap-3 text-[13px]">
            <dl className="grid grid-cols-[90px_1fr] gap-y-1.5">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
            {item.kind === 'IMAGE' && (
              <label className="flex flex-col gap-1.5">
                <span className="font-medium">Alt text</span>
                <Textarea value={alt} onChange={(e) => setAlt(e.target.value)} readOnly={!canEdit} placeholder="Describe the image for people using screen readers" maxLength={500} className="min-h-[70px]" />
                {canEdit && alt !== (item.altText ?? '') && (
                  <Button
                    size="sm"
                    variant="primary"
                    className="self-start"
                    loading={saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const { media } = await api<{ media: MediaDto }>(`/api/w/${workspaceId}/media/${item.id}`, { method: 'PATCH', body: { altText: alt.trim() || null } });
                        onUpdated(media);
                        toast.success('Alt text saved');
                      } catch (err) {
                        toast.error(errorMessage(err));
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Save alt text
                  </Button>
                )}
              </label>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" asChild className="mr-auto">
            <a href={item.url} download={item.originalName}>
              <Download /> Download
            </a>
          </Button>
          {canDelete && (
            <Button variant="danger-outline" onClick={() => onDelete(item)}>
              <Trash2 /> Delete
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
