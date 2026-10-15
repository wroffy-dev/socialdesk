'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, FileText, FolderKanban, Layers, Search, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { ChannelAvatar } from '@/components/platform-icon';
import { MediaThumb } from '@/components/media/media-thumb';
import { StatusBadge, STATUS_DOT } from '@/components/posts/status-badge';
import { PostActionsMenu } from '@/components/posts/post-actions';
import { api, errorMessage } from '@/lib/api-client';
import { formatAgo, formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { PostListItem } from '@/server/services/posts';
import type { Platform } from '@/lib/platforms';

const TABS = [
  ['all', 'All'],
  ['drafts', 'Drafts'],
  ['scheduled', 'Scheduled'],
  ['publishing', 'Publishing'],
  ['published', 'Published'],
  ['failed', 'Failed'],
  ['cancelled', 'Cancelled'],
] as const;
type TabKey = (typeof TABS)[number][0];

interface ListResponse {
  items: PostListItem[];
  total: number;
  page: number;
  pageSize: number;
  tabCounts: Record<TabKey, number>;
}

const col = createColumnHelper<PostListItem>();

export function PostsList({
  workspace,
  projects,
  channels,
  tags,
  canEdit,
  canPublish,
}: {
  workspace: { id: string; slug: string; timezone: string };
  projects: { id: string; name: string; color: string }[];
  channels: { id: string; projectId: string; name: string; username: string | null; avatarUrl: string | null; platform: Platform }[];
  tags: { id: string; name: string; color: string }[];
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = (TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'all') as TabKey;
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [projectFilter, setProjectFilter] = useState<string[]>(() => (sp.get('project') ? [sp.get('project')!] : []));
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [data, setData] = useState<ListResponse | null>(null);
  const [reload, setReload] = useState(0);

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [sp, pathname, router],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((sp.get('q') ?? '') !== q.trim()) setParam({ q: q.trim() || null, page: null });
    }, 350);
    return () => window.clearTimeout(t);
  }, [q, sp, setParam]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ tab, page: String(page), pageSize: '20' });
    if (sp.get('q')) params.set('q', sp.get('q')!);
    if (projectFilter.length) params.set('projects', projectFilter.join(','));
    if (channelFilter.length) params.set('channels', channelFilter.join(','));
    if (tagFilter.length) params.set('tags', tagFilter.join(','));
    setData((d) => (d ? { ...d, items: d.items } : d));
    api<ListResponse>(`/api/w/${workspace.id}/posts?${params}`)
      .then((res) => !cancelled && setData(res))
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [workspace.id, tab, page, sp, projectFilter, channelFilter, tagFilter, reload]);

  const columns = useMemo(
    () => [
      col.display({
        id: 'post',
        header: 'Post',
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex min-w-[260px] items-center gap-3">
              <MediaThumb media={p.thumb} className="size-11 shrink-0" />
              <div className="min-w-0">
                <p className="line-clamp-2 text-[13px]">{p.caption || <span className="italic text-muted">No text</span>}</p>
                {(projects.length > 1 || p.tags.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {projects.length > 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 text-2xs text-muted">
                        <span className="size-1.5 rounded-full" style={{ background: p.project.color }} />
                        {p.project.name}
                      </span>
                    )}
                    {p.tags.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-subtle px-1.5 text-2xs text-muted">
                        <span className="size-1.5 rounded-full" style={{ background: t.color }} />
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        },
      }),
      col.display({
        id: 'channels',
        header: 'Channels',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            {row.original.versions.map((v) => (
              <Tooltip key={v.id} content={`${v.account.name}: ${v.status.toLowerCase().replace('_', ' ')}${v.lastError ? ` — ${v.lastError}` : ''}`}>
                <span className="relative">
                  <ChannelAvatar name={v.account.name} avatarUrl={v.account.avatarUrl} platform={v.platform} size={24} />
                  <span className={cn('absolute -left-0.5 -top-0.5 size-2 rounded-full ring-2 ring-surface', STATUS_DOT[v.status])} />
                </span>
              </Tooltip>
            ))}
            {row.original.versions.length === 0 && <span className="text-xs text-faint">None</span>}
          </div>
        ),
      }),
      col.accessor('status', { header: 'Status', cell: (info) => <StatusBadge status={info.getValue()} /> }),
      col.display({
        id: 'when',
        header: 'When',
        cell: ({ row }) => {
          const p = row.original;
          const published = p.versions.map((v) => v.publishedAt).filter(Boolean).sort().pop();
          return (
            <span className="whitespace-nowrap text-[13px] text-muted">
              {published ? (
                <>Published {formatAgo(published)}</>
              ) : p.scheduledAt ? (
                <>
                  {formatDateTime(p.scheduledAt, workspace.timezone)}
                  {p.publishMode === 'QUEUE' && <span className="ml-1 text-2xs">· queue</span>}
                </>
              ) : (
                <>Edited {formatAgo(p.updatedAt)}</>
              )}
            </span>
          );
        },
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const live = row.original.versions.find((v) => v.externalUrl);
          return (
            <div className="flex items-center justify-end gap-1">
              {live && (
                <a href={live.externalUrl!} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg" aria-label="View live post">
                  <ExternalLink className="size-4" />
                </a>
              )}
              <PostActionsMenu post={row.original} workspace={workspace} canEdit={canEdit} canPublish={canPublish} onChanged={() => setReload((n) => n + 1)} />
            </div>
          );
        },
      }),
    ],
    [workspace, canEdit, canPublish, projects.length],
  );

  const table = useReactTable({ data: data?.items ?? [], columns, getCoreRowModel: getCoreRowModel() });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-3 px-5 pb-10 sm:px-8">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line scrollbar-thin" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParam({ tab: key === 'all' ? null : key, page: null })}
            className={cn(
              '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm',
              tab === key ? 'border-fg font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {label}
            {data && data.tabCounts[key] > 0 && (
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', key === 'failed' ? 'bg-danger-soft text-danger' : 'bg-subtle text-muted')}>
                {data.tabCounts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search captions" className="pl-8" aria-label="Search captions" />
        </div>
        {projects.length > 1 && (
          <FilterMenu
            icon={<FolderKanban />}
            label="Projects"
            options={projects.map((p) => ({ id: p.id, label: p.name, color: p.color }))}
            value={projectFilter}
            onChange={(v) => {
              setProjectFilter(v);
              setChannelFilter([]);
              setParam({ page: null, project: null });
            }}
          />
        )}
        <FilterMenu
          icon={<Layers />}
          label="Channels"
          options={channels
            .filter((c) => projectFilter.length === 0 || projectFilter.includes(c.projectId))
            .map((c) => ({ id: c.id, label: c.username ?? c.name }))}
          value={channelFilter}
          onChange={(v) => {
            setChannelFilter(v);
            setParam({ page: null });
          }}
        />
        <FilterMenu
          icon={<Tag />}
          label="Tags"
          options={tags.map((t) => ({ id: t.id, label: t.name, color: t.color }))}
          value={tagFilter}
          onChange={(v) => {
            setTagFilter(v);
            setParam({ page: null });
          }}
        />
      </div>

      {!data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={sp.get('q') || projectFilter.length || channelFilter.length || tagFilter.length ? 'No posts match your filters' : `No ${tab === 'all' ? '' : TABS.find(([k]) => k === tab)![1].toLowerCase() + ' '}posts`}
          description={tab === 'failed' ? 'Posts that fail to publish appear here with the reason and a retry option.' : undefined}
          action={
            canEdit &&
            (tab === 'all' || tab === 'drafts') && (
              <Button variant="primary" onClick={() => router.push(`/w/${workspace.slug}/compose`)}>
                Create a post
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-lg border border-line">
          <Table>
            <THead>
              {table.getHeaderGroups().map((hg) => (
                <TR key={hg.id} className="bg-subtle">
                  {hg.headers.map((h) => (
                    <TH key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TH>
                  ))}
                </TR>
              ))}
            </THead>
            <TBody>
              {table.getRowModel().rows.map((row) => (
                <TR key={row.id} className="cursor-pointer hover:bg-subtle" onClick={() => router.push(`/w/${workspace.slug}/publish/posts/${row.original.id}`)}>
                  {row.getVisibleCells().map((cell) => (
                    <TD key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-end gap-2 text-[13px] text-muted">
          <span>
            Page {page} of {pages} · {data.total} posts
          </span>
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterMenu({
  icon,
  label,
  options,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  options: { id: string; label: string; color?: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn(value.length && 'border-accent-ink bg-accent-soft text-accent-ink')}>
          {icon} {label}
          {value.length ? ` · ${value.length}` : ''} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {options.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">Nothing to filter by yet.</p>}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.id}
            checked={value.includes(o.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? [...value, o.id] : value.filter((x) => x !== o.id))}
          >
            {o.color && <span className="size-2.5 rounded-full" style={{ background: o.color }} />}
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
