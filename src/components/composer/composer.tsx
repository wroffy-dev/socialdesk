'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hash,
  ImagePlus,
  Link2,
  RotateCcw,
  Smile,
  Tag,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChannelAvatar, PlatformIcon } from '@/components/platform-icon';
import { MediaThumb } from '@/components/media/media-thumb';
import { MediaPicker } from '@/components/media/media-picker';
import { StatusBadge } from '@/components/posts/status-badge';
import { useConfirm } from '@/components/ui/confirm';
import { useConnectDialog } from '@/components/channels/connect-dialog';
import { api, ApiError, errorMessage } from '@/lib/api-client';
import { charCount, COMING_SOON, countHashtags, errorsOnly, PLATFORM_INFO, validateVersion, type Issue } from '@/lib/platforms';
import { formatAgo, formatDateTime, utcToWall } from '@/lib/time';
import { cn } from '@/lib/utils';
import { PostPreview } from './preview';
import { SchedulePopover, type ScheduleValue } from './schedule-popover';
import type { ComposerChannel, ComposerState, ComposerTag, Override, PostDto, ScheduleAction } from './types';

const EMOJI = ['😀', '😍', '🎉', '🔥', '✨', '🙌', '👏', '💚', '📸', '🚀', '✅', '💡', '📣', '🎁', '☕', '🌿', '👉', '⭐'];
const SHARED = 'shared';
const AUTOSAVE_MS = 2500;

function stateFromPost(post: PostDto | null, channels: ComposerChannel[], preselect: string[]): ComposerState {
  if (!post) {
    const connected = channels.filter((c) => c.status === 'CONNECTED');
    const selected = preselect.length ? preselect.filter((id) => channels.some((c) => c.id === id)) : connected.length === 1 ? [connected[0]!.id] : [];
    return { selected, baseCaption: '', baseMedia: [], baseLinkUrl: null, overrides: {}, tagIds: [], notes: '' };
  }
  const overrides: Record<string, Override> = {};
  for (const v of post.versions) {
    if (v.customized) overrides[v.socialAccountId] = { caption: v.caption, media: v.media, linkUrl: v.linkUrl };
  }
  return {
    selected: post.versions.map((v) => v.socialAccountId),
    baseCaption: post.baseCaption,
    baseMedia: post.baseMedia,
    baseLinkUrl: post.baseLinkUrl,
    overrides,
    tagIds: post.tags.map((t) => t.id),
    notes: post.notes ?? '',
  };
}

function toPayload(s: ComposerState, action: ScheduleAction) {
  return {
    baseCaption: s.baseCaption,
    baseMediaIds: s.baseMedia.map((m) => m.id),
    baseLinkUrl: s.baseLinkUrl?.trim() || null,
    tagIds: s.tagIds,
    notes: s.notes.trim() || null,
    versions: s.selected.map((id) => {
      const o = s.overrides[id];
      return o
        ? { socialAccountId: id, customized: true, caption: o.caption, mediaIds: o.media.map((m) => m.id), linkUrl: o.linkUrl?.trim() || null }
        : { socialAccountId: id, customized: false };
    }),
    action,
  };
}

function defaultSchedule(tz: string, presetIso: string | null): ScheduleValue {
  if (presetIso && new Date(presetIso).getTime() > Date.now() + 60_000) {
    const w = utcToWall(presetIso, tz);
    return { date: w.date, time: w.time, tz };
  }
  const t = new Date(Date.now() + 24 * 3600_000);
  return { date: utcToWall(t, tz).date, time: '10:00', tz };
}

export function Composer({
  workspace,
  channels,
  tags: initialTags,
  post: initialPost,
  nextQueueSlot,
  canPublish,
  canManageChannels,
  canManageTags,
  preselectChannels,
  presetDate,
  defaultMode,
}: {
  workspace: { id: string; slug: string; timezone: string };
  channels: ComposerChannel[];
  tags: ComposerTag[];
  post: PostDto | null;
  nextQueueSlot: string | null;
  canPublish: boolean;
  canManageChannels: boolean;
  canManageTags: boolean;
  preselectChannels: string[];
  presetDate: string | null;
  defaultMode: 'queue' | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const connect = useConnectDialog();
  const base = `/w/${workspace.slug}`;
  const apiBase = `/api/w/${workspace.id}`;

  const [post, setPost] = useState<PostDto | null>(initialPost);
  const [state, setState] = useState<ComposerState>(() => stateFromPost(initialPost, channels, preselectChannels));
  const [tab, setTab] = useState<string>(SHARED);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [tags, setTags] = useState(initialTags);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<null | 'auto' | 'manual' | 'publish'>(null);
  const [savedAt, setSavedAt] = useState<string | null>(initialPost?.updatedAt ?? null);
  const [serverIssues, setServerIssues] = useState<Record<string, Issue[]>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, tick] = useState(0);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const postRef = useRef(post);
  postRef.current = post;

  const status = post?.status ?? 'DRAFT';
  const locked = !!post && !['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELLED'].includes(status);
  const isScheduled = status === 'SCHEDULED';
  const scheduleInitial = useMemo(
    () => defaultSchedule(post?.timezone ?? workspace.timezone, post?.scheduledAt ?? presetDate),
    [post?.timezone, post?.scheduledAt, presetDate, workspace.timezone],
  );

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const selectedChannels = useMemo(() => channels.filter((c) => state.selected.includes(c.id)), [channels, state.selected]);
  const active = selectedChannels.find((c) => c.id === tab) ?? null;

  useEffect(() => {
    if (tab !== SHARED && !state.selected.includes(tab)) setTab(SHARED);
    if (!previewId || !state.selected.includes(previewId)) setPreviewId(state.selected[0] ?? null);
  }, [state.selected, tab, previewId]);

  const effective = useCallback(
    (id: string): Override => state.overrides[id] ?? { caption: state.baseCaption, media: state.baseMedia, linkUrl: state.baseLinkUrl },
    [state],
  );

  const issuesByChannel = useMemo(() => {
    const out: Record<string, Issue[]> = {};
    for (const c of selectedChannels) {
      const e = effective(c.id);
      out[c.id] = validateVersion(c.platform, { caption: e.caption, linkUrl: e.linkUrl, media: e.media });
      if (c.status !== 'CONNECTED') out[c.id]!.push({ severity: 'error', message: `${c.name} needs to be reconnected.` });
    }
    return out;
  }, [selectedChannels, effective]);

  const blockers = useMemo(() => {
    const list: string[] = [];
    if (state.selected.length === 0) list.push('Choose at least one channel');
    for (const c of selectedChannels) {
      const err = errorsOnly(issuesByChannel[c.id] ?? [])[0];
      if (err) list.push(`${PLATFORM_INFO[c.platform].label} (${c.name}): ${err.message}`);
    }
    return list;
  }, [state.selected, selectedChannels, issuesByChannel]);

  const hasContent = state.baseCaption.trim() !== '' || state.baseMedia.length > 0 || Object.keys(state.overrides).length > 0;

  // ---- editing helpers ----
  const update = (fn: (s: ComposerState) => ComposerState) => {
    if (locked) return;
    setState(fn);
    setDirty(true);
    setServerIssues({});
  };

  const current: Override = active ? effective(active.id) : { caption: state.baseCaption, media: state.baseMedia, linkUrl: state.baseLinkUrl };
  const editingShared = !active || !state.overrides[active.id];
  const canEditCurrent = !active || !!state.overrides[active.id];

  const setCurrent = (patch: Partial<Override>) =>
    update((s) => {
      if (!active) {
        return {
          ...s,
          baseCaption: patch.caption ?? s.baseCaption,
          baseMedia: patch.media ?? s.baseMedia,
          baseLinkUrl: patch.linkUrl !== undefined ? patch.linkUrl : s.baseLinkUrl,
        };
      }
      const o = s.overrides[active.id];
      if (!o) return s;
      return { ...s, overrides: { ...s.overrides, [active.id]: { ...o, ...patch } } };
    });

  const customize = (id: string, on: boolean) =>
    update((s) => {
      const overrides = { ...s.overrides };
      if (on) overrides[id] = { caption: s.baseCaption, media: [...s.baseMedia], linkUrl: s.baseLinkUrl };
      else delete overrides[id];
      return { ...s, overrides };
    });

  const toggleChannel = (id: string) =>
    update((s) => ({ ...s, selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] }));

  const insertAtCursor = (snippet: string) => {
    const el = textRef.current;
    const text = current.caption;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setCurrent({ caption: text.slice(0, start) + snippet + text.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const moveMedia = (idx: number, dir: -1 | 1) => {
    const list = [...current.media];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j]!, list[idx]!];
    setCurrent({ media: list });
  };

  // ---- persistence ----
  const save = useCallback(
    async (action: ScheduleAction, mode: 'auto' | 'manual' | 'publish') => {
      setSaving(mode);
      try {
        const payload = toPayload(stateRef.current, action);
        const existing = postRef.current;
        const res = existing
          ? await api<{ post: PostDto }>(`${apiBase}/posts/${existing.id}`, { method: 'PUT', body: payload })
          : await api<{ post: PostDto }>(`${apiBase}/posts`, { method: 'POST', body: payload });
        setPost(res.post);
        setSavedAt(res.post.updatedAt);
        setDirty(false);
        if (!existing) window.history.replaceState(null, '', `${base}/compose/${res.post.id}`);
        return res.post;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'validation_error') {
          const versions = (err.details as { versions?: { socialAccountId: string; issues: Issue[] }[] })?.versions ?? [];
          setServerIssues(Object.fromEntries(versions.map((v) => [v.socialAccountId, v.issues])));
        }
        if (mode !== 'auto') toast.error(errorMessage(err));
        return null;
      } finally {
        setSaving(null);
      }
    },
    [apiBase, base],
  );

  // Autosave drafts shortly after edits stop. Scheduled posts are only saved explicitly.
  useEffect(() => {
    if (!dirty || locked || isScheduled || !hasContent || saving) return;
    const t = window.setTimeout(() => void save({ type: 'save' }, 'auto'), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [dirty, state, locked, isScheduled, hasContent, saving, save]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const submit = async (action: ScheduleAction) => {
    if (action.type === 'publish_now') {
      const ok = await confirm({
        title: 'Publish now?',
        description: `This will publish to ${selectedChannels.map((c) => c.name).join(', ')} right away.`,
        confirmLabel: 'Publish now',
      });
      if (!ok) return;
    }
    const saved = await save(action, 'publish');
    if (!saved) return;
    const msg =
      action.type === 'publish_now'
        ? 'Publishing started'
        : action.type === 'queue'
          ? `Added to queue for ${formatDateTime(saved.scheduledAt!, saved.timezone ?? workspace.timezone)}`
          : action.type === 'schedule'
            ? `Scheduled for ${formatDateTime(saved.scheduledAt!, saved.timezone ?? workspace.timezone)}`
            : action.type === 'draft'
              ? 'Saved as draft'
              : 'Changes saved';
    toast.success(msg);
    if (action.type !== 'save' && action.type !== 'draft') {
      router.push(`${base}/publish/posts/${saved.id}`);
      router.refresh();
    }
  };

  const leave = async () => {
    if (dirty && hasContent && !locked) {
      if (isScheduled) {
        const ok = await confirm({ title: 'Discard changes?', description: 'Your edits to this scheduled post have not been saved.', confirmLabel: 'Discard', destructive: true });
        if (!ok) return;
      } else {
        await save({ type: 'save' }, 'manual');
      }
    }
    router.push(`${base}/publish`);
    router.refresh();
  };

  const createTag = async (name: string) => {
    try {
      const { tag } = await api<{ tag: ComposerTag }>(`${apiBase}/tags`, { body: { name } });
      setTags((t) => [...t, tag].sort((a, b) => a.name.localeCompare(b.name)));
      update((s) => ({ ...s, tagIds: [...s.tagIds, tag.id] }));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const previewChannel = selectedChannels.find((c) => c.id === previewId) ?? selectedChannels[0] ?? null;
  const previewContent = previewChannel ? effective(previewChannel.id) : null;
  const activeIssues = active ? [...(issuesByChannel[active.id] ?? []), ...(serverIssues[active.id] ?? [])] : [];
  const charLimit = active ? PLATFORM_INFO[active.platform].maxChars : Math.min(...selectedChannels.map((c) => PLATFORM_INFO[c.platform].maxChars), 63206);
  const chars = charCount(current.caption);
  const hashtags = countHashtags(current.caption);
  const savedLabel = saving === 'auto' ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved · ${formatAgo(savedAt)}` : '';

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 sm:px-6 lg:rounded-t-xl">
        <Button variant="ghost" size="icon" onClick={leave} aria-label="Back">
          <ArrowLeft />
        </Button>
        <h1 className="text-lg font-semibold">{post ? 'Edit post' : 'Create post'}</h1>
        {post && <StatusBadge status={status} />}
        <span className="text-xs text-muted" aria-live="polite">
          {savedLabel}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={locked}>
                <Tag /> Tags{state.tagIds.length > 0 && ` · ${state.tagIds.length}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Tags</DropdownMenuLabel>
              {tags.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">No tags yet.</p>}
              {tags.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t.id}
                  checked={state.tagIds.includes(t.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => update((s) => ({ ...s, tagIds: on ? [...s.tagIds, t.id] : s.tagIds.filter((x) => x !== t.id) }))}
                >
                  <span className="size-2.5 rounded-full" style={{ background: t.color }} /> {t.name}
                </DropdownMenuCheckboxItem>
              ))}
              {canManageTags && (
                <>
                  <DropdownMenuSeparator />
                  <NewTagInput onCreate={createTag} />
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {locked && (
        <div className="mx-4 mt-4 sm:mx-6">
          <div className="flex items-center gap-2 rounded-lg border border-info/20 bg-info-soft px-3 py-2 text-[13px] text-info">
            <AlertCircle className="size-4" /> This post is {status === 'PUBLISHING' ? 'publishing' : 'published'} and can no longer be edited.
            <Link href={`${base}/publish/posts/${post!.id}`} className="ml-auto font-medium underline">
              View details
            </Link>
          </div>
        </div>
      )}

      {/* Channel picker */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6">
        {channels.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            No channels connected yet.
            {canManageChannels && (
              <Button size="sm" variant="primary" onClick={connect.open}>
                Connect a channel
              </Button>
            )}
          </div>
        ) : (
          channels.map((c) => {
            const on = state.selected.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleChannel(c.id)}
                disabled={locked}
                aria-pressed={on}
                title={c.status !== 'CONNECTED' ? `${c.name} needs to be reconnected` : c.name}
                className={cn(
                  'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors',
                  on ? 'border-accent-ink bg-accent-soft' : 'border-line bg-surface opacity-70 hover:opacity-100',
                )}
              >
                <ChannelAvatar name={c.name} avatarUrl={c.avatarUrl} platform={c.platform} size={26} />
                <span className="max-w-[140px] truncate">{c.username ?? c.name}</span>
                {c.status !== 'CONNECTED' && <TriangleAlert className="size-3.5 text-danger" />}
              </button>
            );
          })
        )}
        {COMING_SOON.slice(0, 2).map((p) => (
          <span key={p.key} className="flex items-center gap-2 rounded-full border border-dashed border-line py-1 pl-1 pr-3 text-[13px] text-faint" title="Coming soon">
            <PlatformIcon platform={p.key} size={26} muted /> {p.label}
          </span>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Editor */}
        <div className="flex min-w-0 flex-col gap-4 border-line px-4 py-5 sm:px-6 lg:border-r">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-line scrollbar-thin" role="tablist">
            <TabButton active={tab === SHARED} onClick={() => setTab(SHARED)}>
              Shared
            </TabButton>
            {selectedChannels.map((c) => {
              const errs = errorsOnly(issuesByChannel[c.id] ?? []).length;
              return (
                <TabButton key={c.id} active={tab === c.id} onClick={() => setTab(c.id)}>
                  <PlatformIcon platform={c.platform} size={16} />
                  <span className="max-w-[120px] truncate">{c.username ?? c.name}</span>
                  {state.overrides[c.id] && <span className="size-1.5 rounded-full bg-fg" title="Customised" />}
                  {errs > 0 && <AlertCircle className="size-3.5 text-danger" aria-label={`${errs} problems`} />}
                </TabButton>
              );
            })}
          </div>

          {active && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2">
              <div className="text-[13px]">
                {editingShared ? (
                  <span className="text-muted">Using the shared caption and media.</span>
                ) : (
                  <span>
                    Customised for <strong>{active.name}</strong>. Shared edits won&apos;t change it.
                  </span>
                )}
              </div>
              {editingShared ? (
                <Button size="sm" variant="outline" onClick={() => customize(active.id, true)} disabled={locked}>
                  <ArrowLeftRight /> Customise
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => customize(active.id, false)} disabled={locked}>
                  <RotateCcw /> Reset to shared
                </Button>
              )}
            </div>
          )}

          {/* Caption */}
          <div className={cn('rounded-lg border border-line focus-within:border-line-strong', !canEditCurrent && 'bg-subtle')}>
            <Textarea
              ref={textRef}
              value={current.caption}
              onChange={(e) => setCurrent({ caption: e.target.value })}
              readOnly={!canEditCurrent || locked}
              placeholder={active ? `Write a caption for ${PLATFORM_INFO[active.platform].label}…` : 'What would you like to share?'}
              className="min-h-[170px] resize-y border-0 bg-transparent focus-visible:ring-0"
              aria-label="Caption"
            />
            <div className="flex items-center gap-0.5 border-t border-line px-2 py-1.5">
              <ToolbarButton label="Add media" onClick={() => setPickerOpen(true)} disabled={!canEditCurrent || locked}>
                <ImagePlus />
              </ToolbarButton>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" disabled={!canEditCurrent || locked} className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg disabled:opacity-40" aria-label="Insert emoji">
                    <Smile className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2">
                  <div className="grid grid-cols-6 gap-0.5">
                    {EMOJI.map((e) => (
                      <button key={e} type="button" className="size-8 rounded-md text-lg hover:bg-hover" onClick={() => insertAtCursor(e)}>
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <ToolbarButton label="Insert hashtag" onClick={() => insertAtCursor(current.caption && !/\s$/.test(current.caption) ? ' #' : '#')} disabled={!canEditCurrent || locked}>
                <Hash />
              </ToolbarButton>
              <span className="ml-auto flex items-center gap-3 text-xs tabular-nums text-muted">
                {hashtags > 0 && <span className={cn(hashtags > 30 && active?.platform !== 'FACEBOOK' && 'text-danger')}>{hashtags} #</span>}
                <span className={cn(chars > charLimit && 'font-medium text-danger')}>
                  {chars.toLocaleString()} / {charLimit.toLocaleString()}
                </span>
              </span>
            </div>
          </div>

          {/* Media */}
          <div className="flex flex-wrap gap-2">
            {current.media.map((m, i) => (
              <div key={m.id} className="group relative">
                <MediaThumb media={m} className="size-24" />
                {canEditCurrent && !locked && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <button type="button" onClick={() => moveMedia(i, -1)} disabled={i === 0} className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30" aria-label="Move left">
                      <ChevronLeft className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMedia(i, 1)}
                      disabled={i === current.media.length - 1}
                      className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30"
                      aria-label="Move right"
                    >
                      <ChevronRight className="size-3.5" />
                    </button>
                  </div>
                )}
                {canEditCurrent && !locked && (
                  <button
                    type="button"
                    onClick={() => setCurrent({ media: current.media.filter((x) => x.id !== m.id) })}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                    aria-label={`Remove ${m.originalName}`}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {canEditCurrent && !locked && current.media.length < 10 && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex size-24 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line-strong text-xs text-muted hover:border-fg/40 hover:text-fg"
              >
                <ImagePlus className="size-5" /> Add media
              </button>
            )}
          </div>

          {/* Link */}
          {(!active || active.platform === 'FACEBOOK' || current.linkUrl) && (
            <label className="flex items-center gap-2">
              <Link2 className="size-4 shrink-0 text-muted" />
              <Input
                value={current.linkUrl ?? ''}
                onChange={(e) => setCurrent({ linkUrl: e.target.value || null })}
                readOnly={!canEditCurrent || locked}
                placeholder="Link (optional) — shown as a link preview on Facebook"
                aria-label="Link"
                className="h-8"
              />
            </label>
          )}

          {/* Issues */}
          {active ? (
            <IssueList issues={activeIssues} />
          ) : (
            selectedChannels.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {selectedChannels.map((c) => {
                  const list = [...(issuesByChannel[c.id] ?? []), ...(serverIssues[c.id] ?? [])];
                  const errs = errorsOnly(list);
                  return (
                    <button key={c.id} type="button" onClick={() => setTab(c.id)} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-[13px] hover:bg-subtle">
                      <PlatformIcon platform={c.platform} size={16} />
                      <span className="font-medium">{c.username ?? c.name}</span>
                      {errs.length === 0 ? (
                        <span className="flex items-center gap-1 text-accent-ink">
                          <CheckCircle2 className="size-3.5" /> Ready
                        </span>
                      ) : (
                        <span className="truncate text-danger">{errs[0]!.message}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}

          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted hover:text-fg">Internal note</summary>
            <Textarea
              value={state.notes}
              onChange={(e) => update((s) => ({ ...s, notes: e.target.value }))}
              readOnly={locked}
              placeholder="Only visible to your team"
              className="mt-2 min-h-[60px]"
              maxLength={2000}
            />
          </details>
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-3 bg-subtle px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-muted">Preview</span>
            {selectedChannels.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setPreviewId(c.id)}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs', previewChannel?.id === c.id ? 'border-fg bg-surface' : 'border-line text-muted hover:text-fg')}
              >
                {c.username ?? c.name}
              </button>
            ))}
          </div>
          {previewChannel && previewContent ? (
            <PostPreview channel={previewChannel} caption={previewContent.caption} media={previewContent.media} linkUrl={previewContent.linkUrl} />
          ) : (
            <p className="py-10 text-center text-[13px] text-muted">Choose a channel to see a preview.</p>
          )}
          <p className="text-center text-xs text-faint">Previews are approximate. Each platform renders posts in its own way.</p>
        </div>
      </div>

      {/* Footer */}
      {!locked && (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3 sm:px-6 lg:rounded-b-xl">
          {blockers.length > 0 && hasContent && (
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-danger">
              <AlertCircle className="size-4 shrink-0" />
              <span className="truncate">{blockers[0]}</span>
              {blockers.length > 1 && <Badge variant="danger">+{blockers.length - 1}</Badge>}
            </span>
          )}
          {isScheduled && post?.scheduledAt && (
            <span className="text-[13px] text-muted">Scheduled for {formatDateTime(post.scheduledAt, post.timezone ?? workspace.timezone)}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {isScheduled ? (
              <>
                <Button variant="outline" onClick={() => submit({ type: 'draft' })} disabled={!!saving}>
                  Unschedule
                </Button>
                {canPublish && (
                  <SchedulePopover
                    label="Reschedule"
                    initial={scheduleInitial}
                    nextQueueSlot={nextQueueSlot}
                    disabled={blockers.length > 0 || !!saving}
                    onSubmit={submit}
                  />
                )}
                <Button variant="primary" onClick={() => submit({ type: 'save' })} disabled={blockers.length > 0 || !dirty} loading={saving === 'manual' || saving === 'publish'}>
                  Update post
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => submit({ type: 'draft' })} disabled={!hasContent || !!saving} loading={saving === 'manual'}>
                  Save draft
                </Button>
                {canPublish ? (
                  defaultMode === 'queue' ? (
                    <>
                      <SchedulePopover label="Other options" initial={scheduleInitial} nextQueueSlot={nextQueueSlot} disabled={blockers.length > 0 || !!saving} onSubmit={submit} />
                      <Button variant="primary" onClick={() => submit({ type: 'queue' })} disabled={blockers.length > 0 || !nextQueueSlot} loading={saving === 'publish'}>
                        Add to queue
                      </Button>
                    </>
                  ) : (
                    <SchedulePopover initial={scheduleInitial} nextQueueSlot={nextQueueSlot} disabled={blockers.length > 0 || !!saving} busy={saving === 'publish'} onSubmit={submit} />
                  )
                ) : (
                  <span className="text-xs text-muted">Your role can save drafts only.</span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        workspaceId={workspace.id}
        max={Math.max(1, 10 - current.media.length)}
        onAdd={(added) => setCurrent({ media: [...current.media, ...added.filter((a) => !current.media.some((m) => m.id === a.id))].slice(0, 10) })}
      />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
        active ? 'border-fg font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function ToolbarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-accent-ink">
        <CheckCircle2 className="size-4" /> Ready to publish
      </p>
    );
  }
  const unique = issues.filter((i, idx) => issues.findIndex((x) => x.message === i.message) === idx);
  return (
    <ul className="flex flex-col gap-1">
      {unique.map((i) => (
        <li key={i.message} className={cn('flex items-start gap-1.5 text-[13px]', i.severity === 'error' ? 'text-danger' : 'text-warning')}>
          {i.severity === 'error' ? <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />}
          {i.message}
        </li>
      ))}
    </ul>
  );
}

function NewTagInput({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form
      className="p-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
        setName('');
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="New tag + Enter" className="h-8 text-[13px]" maxLength={40} />
    </form>
  );
}
