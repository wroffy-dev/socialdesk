'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import type { DatesSetArg, EventContentArg, EventDropArg, EventInput, EventSourceFuncArg } from '@fullcalendar/core';
import type { DateClickArg, EventReceiveArg } from '@fullcalendar/interaction';
import { ChevronDown, ChevronLeft, ChevronRight, FolderKanban, Globe, Layers, PanelRightOpen, Tag, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChannelAvatar, PlatformIcon } from '@/components/platform-icon';
import { MediaThumb } from '@/components/media/media-thumb';
import { STATUS_DOT } from '@/components/posts/status-badge';
import { Spinner } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api-client';
import { formatInTz, fromFloating, toFloating } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { PostListItem } from '@/server/services/posts';
import type { Platform } from '@/lib/platforms';

type View = 'timeGridWeek' | 'dayGridMonth' | 'timeGridDay';
const VIEW_LABEL: Record<View, string> = { dayGridMonth: 'Month', timeGridWeek: 'Week', timeGridDay: 'Day' };
const STATUS_FILTERS = {
  all: { label: 'All posts', statuses: '' },
  scheduled: { label: 'Scheduled', statuses: 'SCHEDULED,PUBLISHING' },
  published: { label: 'Published', statuses: 'PUBLISHED,PARTIALLY_PUBLISHED' },
  failed: { label: 'Failed', statuses: 'FAILED,PARTIALLY_PUBLISHED' },
} as const;
const VIEW_KEY = 'sd_calendar_view';

interface Channel {
  id: string;
  projectId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  platform: Platform;
}

export function PublishCalendar({
  workspace,
  projects,
  channels,
  tags,
  canPublish,
  canCreate,
  initialChannel,
  initialProject,
}: {
  workspace: { id: string; slug: string; timezone: string };
  projects: { id: string; name: string; color: string }[];
  channels: Channel[];
  tags: { id: string; name: string; color: string }[];
  canPublish: boolean;
  canCreate: boolean;
  initialChannel: string | null;
  initialProject: string | null;
}) {
  const router = useRouter();
  const calRef = useRef<FullCalendar>(null);
  const draftsRef = useRef<HTMLDivElement>(null);
  const tz = workspace.timezone;
  const apiBase = `/api/w/${workspace.id}`;
  const base = `/w/${workspace.slug}`;

  const [view, setView] = useState<View>('timeGridWeek');
  const [title, setTitle] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | null>(initialProject);
  const [channelFilter, setChannelFilter] = useState<string[]>(initialChannel ? [initialChannel] : []);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<keyof typeof STATUS_FILTERS>('all');
  const [loading, setLoading] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState<PostListItem[] | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY) as View | null;
      if (saved && saved in VIEW_LABEL) {
        setView(saved);
        calRef.current?.getApi().changeView(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => setChannelFilter(initialChannel ? [initialChannel] : []), [initialChannel]);
  useEffect(() => setProjectFilter(initialProject), [initialProject]);
  const currentProject = projects.find((p) => p.id === projectFilter) ?? null;
  const visibleChannels = projectFilter ? channels.filter((c) => c.projectId === projectFilter) : channels;
  const selectProject = (id: string | null) => {
    setProjectFilter(id);
    setChannelFilter([]);
    setDrafts(null);
  };

  const fetchEvents = useCallback(
    async (info: EventSourceFuncArg): Promise<EventInput[]> => {
      const params = new URLSearchParams({
        from: fromFloating(info.start, tz).toISOString(),
        to: fromFloating(info.end, tz).toISOString(),
      });
      if (projectFilter) params.set('projects', projectFilter);
      if (channelFilter.length) params.set('channels', channelFilter.join(','));
      if (tagFilter.length) params.set('tags', tagFilter.join(','));
      if (STATUS_FILTERS[statusFilter].statuses) params.set('statuses', STATUS_FILTERS[statusFilter].statuses);
      const { items } = await api<{ items: PostListItem[] }>(`${apiBase}/calendar?${params}`);
      return items.map((p) => {
        const start = toFloating(p.scheduledAt!, tz);
        const movable = canPublish && p.status === 'SCHEDULED' && new Date(p.scheduledAt!).getTime() > Date.now() + 60_000;
        return {
          id: p.id,
          start,
          end: new Date(start.getTime() + 45 * 60_000),
          editable: movable,
          durationEditable: false,
          extendedProps: { post: p },
        };
      });
    },
    [apiBase, tz, projectFilter, channelFilter, tagFilter, statusFilter, canPublish],
  );

  // Refetch when filters change (FullCalendar already fetches on mount).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    calRef.current?.getApi().refetchEvents();
  }, [fetchEvents]);

  const loadDrafts = useCallback(async () => {
    const res = await api<{ items: PostListItem[] }>(`${apiBase}/posts?tab=drafts&pageSize=50${projectFilter ? `&projects=${projectFilter}` : ''}`);
    setDrafts(res.items);
  }, [apiBase, projectFilter]);

  useEffect(() => {
    if (showDrafts && drafts === null) void loadDrafts();
  }, [showDrafts, drafts, loadDrafts]);

  // Make drafts draggable onto the calendar.
  useEffect(() => {
    if (!showDrafts || !draftsRef.current || !canPublish) return;
    const d = new Draggable(draftsRef.current, {
      itemSelector: '[data-draft-id]',
      eventData: (el) => ({
        id: `draft-${el.getAttribute('data-draft-id')}`,
        title: el.getAttribute('data-title') ?? '',
        duration: '00:45',
        create: true,
        extendedProps: { draftId: el.getAttribute('data-draft-id') },
      }),
    });
    return () => d.destroy();
  }, [showDrafts, canPublish, drafts]);

  const onDrop = async (info: EventDropArg) => {
    const at = fromFloating(info.event.start!, tz);
    if (at.getTime() < Date.now() + 60_000) {
      info.revert();
      toast.error("You can't move a post into the past.");
      return;
    }
    try {
      await api(`${apiBase}/posts/${info.event.id}/reschedule`, { body: { scheduledAt: at.toISOString() } });
      toast.success(`Moved to ${formatInTz(at, tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await api(`${apiBase}/posts/${info.event.id}/reschedule`, { body: { scheduledAt: fromFloating(info.oldEvent.start!, tz).toISOString() } });
              calRef.current?.getApi().refetchEvents();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          },
        },
      });
      router.refresh();
    } catch (err) {
      info.revert();
      toast.error(errorMessage(err));
    }
  };

  const onReceive = async (info: EventReceiveArg) => {
    const draftId = info.event.extendedProps.draftId as string;
    const at = fromFloating(info.event.start!, tz);
    info.event.remove();
    if (at.getTime() < Date.now() + 60_000) {
      toast.error('Drop the draft on a future time.');
      return;
    }
    try {
      await api(`${apiBase}/posts/${draftId}/schedule`, { body: { type: 'schedule', scheduledAt: at.toISOString(), timezone: tz } });
      toast.success('Draft scheduled');
      setDrafts((cur) => cur?.filter((d) => d.id !== draftId) ?? null);
      calRef.current?.getApi().refetchEvents();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const onDateClick = (info: DateClickArg) => {
    if (!canCreate) return;
    let floating = info.date;
    if (info.allDay) floating = new Date(Date.UTC(floating.getUTCFullYear(), floating.getUTCMonth(), floating.getUTCDate(), 10, 0));
    const at = fromFloating(floating, tz);
    if (at.getTime() < Date.now() + 5 * 60_000) return;
    router.push(`${base}/compose?date=${encodeURIComponent(at.toISOString())}${projectFilter ? `&project=${projectFilter}` : ''}`);
  };

  const apiCal = () => calRef.current?.getApi();
  const changeView = (v: View) => {
    setView(v);
    apiCal()?.changeView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const nowFloating = useMemo(() => toFloating(new Date(), tz), [tz]);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-6 sm:px-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pb-3">
        <Button variant="ghost" size="icon" onClick={() => apiCal()?.prev()} aria-label="Previous">
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => apiCal()?.next()} aria-label="Next">
          <ChevronRight />
        </Button>
        <h2 className="min-w-[120px] text-lg font-medium">{title}</h2>
        <Button variant="outline" size="sm" onClick={() => apiCal()?.today()}>
          Today
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              {VIEW_LABEL[view]} <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={view} onValueChange={(v) => changeView(v as View)}>
              {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                <DropdownMenuRadioItem key={v} value={v}>
                  {VIEW_LABEL[v]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {loading && <Spinner />}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {projects.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={cn(projectFilter && 'bg-accent-soft text-accent-ink')}>
                  {currentProject ? (
                    <>
                      <span className="size-2.5 rounded-full" style={{ background: currentProject.color }} /> {currentProject.name}
                    </>
                  ) : (
                    <>
                      <FolderKanban /> All projects
                    </>
                  )}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuRadioGroup value={projectFilter ?? ''} onValueChange={(v) => selectProject(v || null)}>
                  <DropdownMenuRadioItem value="">All projects</DropdownMenuRadioItem>
                  {projects.map((p) => (
                    <DropdownMenuRadioItem key={p.id} value={p.id}>
                      <span className="size-2.5 rounded-full" style={{ background: p.color }} /> {p.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn(channelFilter.length && 'bg-accent-soft text-accent-ink')}>
                <Layers /> Channels{channelFilter.length ? ` · ${channelFilter.length}` : ''} <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Show channels</DropdownMenuLabel>
              {visibleChannels.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">No channels connected.</p>}
              {visibleChannels.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={channelFilter.includes(c.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => setChannelFilter((cur) => (on ? [...cur, c.id] : cur.filter((x) => x !== c.id)))}
                >
                  <ChannelAvatar name={c.name} avatarUrl={c.avatarUrl} platform={c.platform} size={20} /> {c.username ?? c.name}
                </DropdownMenuCheckboxItem>
              ))}
              {channelFilter.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <button className="w-full rounded-md px-2 py-1.5 text-left text-[13px] text-muted hover:bg-subtle" onClick={() => setChannelFilter([])}>
                    Show all channels
                  </button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn(statusFilter !== 'all' && 'bg-accent-soft text-accent-ink')}>
                {STATUS_FILTERS[statusFilter].label} <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={statusFilter} onValueChange={(v) => setStatusFilter(v as keyof typeof STATUS_FILTERS)}>
                {(Object.keys(STATUS_FILTERS) as (keyof typeof STATUS_FILTERS)[]).map((k) => (
                  <DropdownMenuRadioItem key={k} value={k}>
                    {STATUS_FILTERS[k].label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn(tagFilter.length && 'bg-accent-soft text-accent-ink')}>
                <Tag /> Tags{tagFilter.length ? ` · ${tagFilter.length}` : ''} <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {tags.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">No tags yet. Add them in the composer.</p>}
              {tags.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t.id}
                  checked={tagFilter.includes(t.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => setTagFilter((cur) => (on ? [...cur, t.id] : cur.filter((x) => x !== t.id)))}
                >
                  <span className="size-2.5 rounded-full" style={{ background: t.color }} /> {t.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={() => setShowDrafts((s) => !s)} className={cn(showDrafts && 'bg-accent-soft text-accent-ink')}>
            <PanelRightOpen /> No Date
          </Button>
          <span className="ml-1 hidden items-center gap-1.5 border-l border-line pl-3 text-[13px] text-fg/80 md:flex" title="Workspace timezone (change in settings)">
            <Globe className="size-4 text-muted" />
            {tz.split('/').pop()?.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="sd-calendar min-w-0 flex-1">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={view}
            timeZone="UTC"
            now={() => toFloating(new Date(), tz)}
            headerToolbar={false}
            height="calc(100vh - 210px)"
            firstDay={0}
            allDaySlot={false}
            nowIndicator
            slotDuration="01:00:00"
            slotLabelFormat={{ hour: 'numeric', meridiem: 'short' }}
            dayHeaderContent={(arg) =>
              arg.view.type === 'dayGridMonth' ? (
                <span>{arg.date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</span>
              ) : (
                <span>
                  {arg.date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}
                  <span className="ml-2 tabular-nums">{arg.date.getUTCDate()}</span>
                </span>
              )
            }
            scrollTime={`${String(Math.max(0, nowFloating.getUTCHours() - 1)).padStart(2, '0')}:00:00`}
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
            dayMaxEvents={3}
            eventStartEditable
            droppable={canPublish}
            events={fetchEvents}
            loading={setLoading}
            datesSet={(arg: DatesSetArg) => {
              const mid = new Date((arg.start.getTime() + arg.end.getTime()) / 2);
              setTitle(mid.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC', ...(arg.view.type === 'timeGridDay' ? { day: 'numeric' } : {}) }));
            }}
            eventContent={(arg) => <EventCard arg={arg} tz={tz} />}
            eventClick={(info) => {
              info.jsEvent.preventDefault();
              router.push(`${base}/publish/posts/${info.event.id}`);
            }}
            eventDrop={onDrop}
            eventReceive={onReceive}
            dateClick={onDateClick}
            eventAllow={(span) => fromFloating(span.start, tz).getTime() > Date.now() + 60_000}
          />
        </div>

        {showDrafts && (
          <aside className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-line bg-subtle p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">Drafts without a date</h3>
              <button className="text-muted hover:text-fg" onClick={() => setShowDrafts(false)} aria-label="Close drafts panel">
                <Undo2 className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted">{canPublish ? 'Drag a draft onto the calendar to schedule it.' : 'Drafts waiting to be scheduled.'}</p>
            <div ref={draftsRef} className="flex flex-col gap-2 overflow-y-auto scrollbar-thin" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              {drafts === null ? (
                <Spinner className="mx-auto my-4" />
              ) : drafts.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted">No drafts.</p>
              ) : (
                drafts.map((d) => (
                  <div
                    key={d.id}
                    data-draft-id={d.id}
                    data-title={d.caption.slice(0, 60)}
                    className={cn('flex gap-2 rounded-md border border-line bg-surface p-2 text-xs shadow-card', canPublish && 'cursor-grab active:cursor-grabbing')}
                    onDoubleClick={() => router.push(`${base}/compose/${d.id}`)}
                    title="Double-click to edit"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex gap-0.5">
                        {d.versions.map((v) => (
                          <PlatformIcon key={v.id} platform={v.platform} size={14} />
                        ))}
                      </div>
                      <p className="line-clamp-2">{d.caption || <span className="italic text-muted">No text</span>}</p>
                    </div>
                    {d.thumb && <MediaThumb media={d.thumb} className="size-10 shrink-0" />}
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function EventCard({ arg, tz }: { arg: EventContentArg; tz: string }) {
  const post = arg.event.extendedProps.post as PostListItem | undefined;
  if (!post) return <div className="truncate rounded bg-accent-soft px-1.5 py-0.5 text-xs">{arg.event.title}</div>;
  const time = formatInTz(post.scheduledAt!, tz, { hour: 'numeric', minute: '2-digit' });
  const isMonth = arg.view.type === 'dayGridMonth';
  if (isMonth) {
    return (
      <div className="flex w-full items-center gap-1.5 overflow-hidden rounded px-1 py-0.5 text-xs text-fg hover:bg-subtle">
        <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[post.status])} />
        <span className="shrink-0 text-muted">{time}</span>
        <span className="truncate">{post.caption || 'Media post'}</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex h-full w-full gap-1.5 overflow-hidden rounded-md border border-line bg-surface p-1.5 text-left text-xs text-fg shadow-card transition-shadow hover:shadow-pop',
        post.status === 'FAILED' && 'border-danger-line bg-danger-soft',
        post.status === 'PUBLISHED' && 'opacity-80',
      )}
    >
      <span className={cn('w-0.5 shrink-0 rounded-full', STATUS_DOT[post.status])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {post.versions.slice(0, 4).map((v) => (
            <PlatformIcon key={v.id} platform={v.platform} size={13} />
          ))}
          <span className="ml-auto shrink-0 text-2xs text-muted">{time}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 leading-snug">{post.caption || <span className="italic text-muted">Media post</span>}</p>
      </div>
      {post.thumb && <MediaThumb media={post.thumb} className="size-8 shrink-0" rounded="md" />}
    </div>
  );
}
