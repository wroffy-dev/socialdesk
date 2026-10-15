'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Info, MessageCircle, MessageSquareQuote, RefreshCw, Search, Send, StickyNote, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PlatformIcon } from '@/components/platform-icon';
import { api, errorMessage } from '@/lib/api-client';
import { formatAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { communityStatus, getCommentThread, listComments } from '@/server/services/community';

type List = Awaited<ReturnType<typeof listComments>>;
type Item = List['items'][number];
type Thread = Awaited<ReturnType<typeof getCommentThread>>;
type Filter = 'unanswered' | 'answered' | 'all' | 'mine';

export function CommunityInbox({
  workspace,
  channels,
  savedReplies,
  members,
  canReply,
  currentUserId,
}: {
  workspace: { id: string; slug: string };
  channels: Awaited<ReturnType<typeof communityStatus>>;
  savedReplies: { id: string; title: string; body: string }[];
  members: { id: string; name: string | null; email: string }[];
  canReply: boolean;
  currentUserId: string;
}) {
  const apiBase = `/api/w/${workspace.id}/comments`;
  const [tab, setTab] = useState<'comments' | 'messages'>('comments');
  const [filter, setFilter] = useState<Filter>('unanswered');
  const [channel, setChannel] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<List | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const supported = channels.filter((c) => c.comments);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ filter });
    if (channel) p.set('channel', channel);
    if (query) p.set('q', query);
    try {
      setList(await api<List>(`${apiBase}?${p}`));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [apiBase, filter, channel, query]);

  useEffect(() => {
    setList(null);
    void load();
  }, [load]);
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setThread(null);
    setReply('');
    setNote('');
    if (selected) api<Thread>(`${apiBase}/${selected.id}`).then(setThread).catch((e) => toast.error(errorMessage(e)));
  }, [selected, apiBase]);

  const patch = async (body: Record<string, unknown>, msg: string) => {
    if (!selected) return;
    try {
      await api(`${apiBase}/${selected.id}`, { method: 'PATCH', body });
      toast.success(msg);
      const next = { ...selected, ...('answered' in body ? { answered: body.answered as boolean } : {}), ...('assignedToId' in body ? { assignedTo: members.find((m) => m.id === body.assignedToId) ?? null } : {}) };
      setSelected(next);
      void load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 px-5 pb-10 sm:px-8">
      <div className="flex items-center gap-1 border-b border-line">
        {(
          [
            ['comments', 'Comments'],
            ['messages', 'Messages'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm', tab === k ? 'border-fg font-medium' : 'border-transparent text-muted hover:text-fg')}
          >
            {label}
            {k === 'comments' && list && list.counts.unanswered > 0 && <Badge variant="success" className="ml-1.5">{list.counts.unanswered}</Badge>}
          </button>
        ))}
      </div>

      {tab === 'messages' ? (
        <EmptyState
          icon={<Info />}
          title="Direct messages aren't available yet"
          description="Reading and answering Instagram and Messenger DMs needs separate Meta permissions and app review. Your connected channels don't have that access, so SocialDesk doesn't show or simulate messages."
        />
      ) : (
        <>
          {supported.length === 0 && (
            <Alert variant="info" title="No channels can share comments yet">
              {channels.length === 0
                ? 'Connect an Instagram or Facebook channel first.'
                : channels.every((c) => c.mode === 'MOCK')
                  ? 'Mock channels don’t have comments. Connect a real channel through Meta to use the inbox.'
                  : 'Reconnect your channels and allow the comment permissions to see comments here.'}
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line p-0.5">
              {(
                [
                  ['unanswered', 'Unanswered'],
                  ['answered', 'Answered'],
                  ['mine', 'Assigned to me'],
                  ['all', 'All'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={cn('rounded-md px-3 py-1.5 text-[13px]', filter === k ? 'bg-accent-soft font-medium text-accent-ink' : 'text-fg/80 hover:bg-subtle')}
                >
                  {label}
                </button>
              ))}
            </div>
            <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)} className="h-9 w-48" aria-label="Channel">
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search comments" className="w-56 pl-8" aria-label="Search comments" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              loading={busy === 'sync'}
              disabled={supported.length === 0}
              onClick={async () => {
                setBusy('sync');
                try {
                  const res = await api<{ comments: number }>(`${apiBase}/sync`, { method: 'POST' });
                  toast.success(`Checked for new comments (${res.comments} found)`);
                  await load();
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(null);
                }
              }}
            >
              <RefreshCw /> Sync now
            </Button>
          </div>

          <div className="grid min-h-[420px] gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-1.5">
              {!list ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)
              ) : list.items.length === 0 ? (
                <EmptyState icon={<MessageCircle />} title={filter === 'unanswered' ? 'All caught up' : 'No comments'} description="Comments on your published posts appear here." />
              ) : (
                list.items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={cn('flex gap-2.5 rounded-lg border p-3 text-left transition-colors', selected?.id === c.id ? 'border-accent-ink bg-accent-soft/40' : 'border-line hover:bg-subtle')}
                  >
                    <PlatformIcon platform={c.channel.platform} size={18} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[13px]">
                        <span className="truncate font-medium">{c.authorName}</span>
                        <span className="shrink-0 text-xs text-faint">{formatAgo(c.postedAt)}</span>
                        {c.answered && <CheckCircle2 className="ml-auto size-3.5 shrink-0 text-accent-ink" aria-label="Answered" />}
                      </p>
                      <p className="line-clamp-2 text-[13px] text-fg/80">{c.body}</p>
                      <p className="mt-1 truncate text-xs text-muted">
                        on “{c.post?.caption?.slice(0, 40) || 'a post'}” · {c.channel.name}
                        {c.assignedTo && ` · ${c.assignedTo.id === currentUserId ? 'you' : (c.assignedTo.name ?? c.assignedTo.email)}`}
                      </p>
                    </div>
                  </button>
                ))
              )}
              {list?.nextCursor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const p = new URLSearchParams({ filter, cursor: list.nextCursor! });
                    const more = await api<List>(`${apiBase}?${p}`);
                    setList({ ...more, items: [...list.items, ...more.items] });
                  }}
                >
                  Load more
                </Button>
              )}
            </div>

            <div className="rounded-xl border border-line">
              {!selected ? (
                <div className="flex h-full min-h-[300px] items-center justify-center p-6 text-[13px] text-muted">Select a comment to read and reply.</div>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                    <Avatar name={selected.authorName} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{selected.authorName}</p>
                      <p className="text-xs text-muted">
                        {selected.authorHandle ? `@${selected.authorHandle} · ` : ''}
                        {formatAgo(selected.postedAt)} on {selected.channel.name}
                      </p>
                    </div>
                    {canReply && (
                      <>
                        <NativeSelect
                          value={selected.assignedTo?.id ?? ''}
                          onChange={(e) => patch({ assignedToId: e.target.value || null }, e.target.value ? 'Assigned' : 'Unassigned')}
                          className="h-8 w-40 text-[13px]"
                          aria-label="Assign to"
                        >
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.id === currentUserId ? 'Me' : (m.name ?? m.email)}
                            </option>
                          ))}
                        </NativeSelect>
                        <Button variant="outline" size="sm" onClick={() => patch({ answered: !selected.answered }, selected.answered ? 'Marked unanswered' : 'Marked answered')}>
                          {selected.answered ? <Undo2 /> : <CheckCircle2 />} {selected.answered ? 'Mark unanswered' : 'Mark answered'}
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                    {selected.post && (
                      <div className="flex items-center gap-2 rounded-md bg-subtle px-3 py-2 text-xs text-muted">
                        <span className="truncate">Post: {selected.post.caption || 'Media post'}</span>
                        <Link href={`/w/${workspace.slug}/publish/posts/${selected.post.id}`} className="ml-auto shrink-0 hover:text-fg">
                          Details
                        </Link>
                        {selected.post.externalUrl && (
                          <a href={selected.post.externalUrl} target="_blank" rel="noreferrer" className="shrink-0 hover:text-fg" aria-label="Open on platform">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap text-[14px]">{selected.body}</p>
                    {thread?.replies.map((r) => (
                      <div key={r.id} className={cn('rounded-lg px-3 py-2 text-[13px]', r.isOwn ? 'ml-8 bg-accent-soft' : 'bg-subtle')}>
                        <p className="text-xs text-muted">
                          {r.authorName} · {formatAgo(r.postedAt)}
                        </p>
                        <p className="whitespace-pre-wrap">{r.body}</p>
                      </div>
                    ))}
                    {thread && thread.notes.length > 0 && (
                      <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-3">
                        {thread.notes.map((n) => (
                          <div key={n.id} className="rounded-md bg-warning-soft px-3 py-2 text-[13px]">
                            <p className="text-xs text-warning">
                              Internal note · {n.author} · {formatAgo(n.createdAt)}
                            </p>
                            <p className="whitespace-pre-wrap">{n.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 border-t border-line p-3">
                    {canReply && thread && !thread.canReplyOnPlatform && (
                      <p className="text-xs text-muted">Replying from SocialDesk isn&apos;t available for this channel. You can still add internal notes.</p>
                    )}
                    {canReply && thread?.canReplyOnPlatform && (
                      <>
                        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply publicly as ${selected.channel.name}`} className="min-h-[70px]" maxLength={2000} />
                        <div className="flex items-center gap-2">
                          {savedReplies.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MessageSquareQuote /> Saved replies
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-64">
                                {savedReplies.map((s) => (
                                  <DropdownMenuItem key={s.id} onSelect={() => setReply((r) => (r ? `${r} ${s.body}` : s.body))}>
                                    <span className="truncate">{s.title}</span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <span className="ml-auto text-xs text-muted">{reply.length}/2000</span>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!reply.trim()}
                            loading={busy === 'reply'}
                            onClick={async () => {
                              setBusy('reply');
                              try {
                                setThread(await api<Thread>(`${apiBase}/${selected.id}/reply`, { body: { text: reply } }));
                                setReply('');
                                setSelected({ ...selected, answered: true });
                                toast.success('Reply posted');
                                void load();
                              } catch (err) {
                                toast.error(errorMessage(err));
                              } finally {
                                setBusy(null);
                              }
                            }}
                          >
                            <Send /> Reply
                          </Button>
                        </div>
                      </>
                    )}
                    <div className="flex items-center gap-2">
                      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note (only your team sees it)" className="h-8 text-[13px]" maxLength={2000} />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!note.trim()}
                        loading={busy === 'note'}
                        onClick={async () => {
                          setBusy('note');
                          try {
                            setThread(await api<Thread>(`${apiBase}/${selected.id}/notes`, { body: { body: note } }));
                            setNote('');
                          } catch (err) {
                            toast.error(errorMessage(err));
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        <StickyNote /> Note
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
