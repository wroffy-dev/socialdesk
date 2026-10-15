'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Pause, Play, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { ChannelAvatar } from '@/components/platform-icon';
import { api, errorMessage } from '@/lib/api-client';
import { formatDateTime, formatTime12, WEEKDAYS } from '@/lib/time';
import type { getQueue } from '@/server/services/queue';

type Queue = Awaited<ReturnType<typeof getQueue>>;
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function QueueManager({
  initial,
  workspace,
  canManage,
  canPublish,
  canCreate,
}: {
  initial: Queue;
  workspace: { id: string; slug: string };
  canManage: boolean;
  canPublish: boolean;
  canCreate: boolean;
}) {
  const [queue, setQueue] = useState(initial);
  const [slots, setSlots] = useState(initial.slots.map((s) => ({ dayOfWeek: s.dayOfWeek, time: s.time })));
  const [newTime, setNewTime] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = JSON.stringify(slots.map((s) => `${s.dayOfWeek}-${s.time}`).sort()) !== JSON.stringify(queue.slots.map((s) => `${s.dayOfWeek}-${s.time}`).sort());
  const apiBase = `/api/w/${workspace.id}/queue`;

  const call = async (key: string, fn: () => Promise<Queue>, msg?: string) => {
    setBusy(key);
    try {
      const q = await fn();
      setQueue(q);
      setSlots(q.slots.map((s) => ({ dayOfWeek: s.dayOfWeek, time: s.time })));
      if (msg) toast.success(msg);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const addSlot = (day: number) => {
    const time = newTime[day] || '09:00';
    if (slots.some((s) => s.dayOfWeek === day && s.time === time)) return;
    setSlots((cur) => [...cur, { dayOfWeek: day, time }]);
  };

  return (
    <div className="grid gap-6 px-5 pb-10 sm:px-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">Posting schedule</h2>
            <p className="text-[13px] text-muted">Queued posts fill these weekly times ({queue.timezone.replace(/_/g, ' ')}).</p>
          </div>
          {canManage && (
            <Button
              variant={queue.paused ? 'primary' : 'outline'}
              size="sm"
              loading={busy === 'pause'}
              onClick={() => call('pause', () => api<Queue>(`${apiBase}/pause`, { body: { paused: !queue.paused } }), queue.paused ? 'Queue resumed' : 'Queue paused')}
            >
              {queue.paused ? <Play /> : <Pause />} {queue.paused ? 'Resume queue' : 'Pause queue'}
            </Button>
          )}
        </div>
        {queue.paused && (
          <Alert variant="warning" title="Queue paused">
            Queued posts won&apos;t publish while paused. When you resume, posts whose time has passed move to the next free slots.
          </Alert>
        )}
        <Card className="divide-y divide-line">
          {ORDER.map((day) => {
            const daySlots = slots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.time.localeCompare(b.time));
            return (
              <div key={day} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="w-24 text-[13px] font-medium">{WEEKDAYS[day]}</span>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {daySlots.length === 0 && <span className="text-xs text-faint">No times</span>}
                  {daySlots.map((s) => (
                    <span key={s.time} className="inline-flex items-center gap-1 rounded-full border border-line bg-subtle px-2 py-0.5 text-xs">
                      {formatTime12(s.time)}
                      {canManage && (
                        <button
                          onClick={() => setSlots((cur) => cur.filter((x) => !(x.dayOfWeek === day && x.time === s.time)))}
                          className="text-muted hover:text-danger"
                          aria-label={`Remove ${formatTime12(s.time)} on ${WEEKDAYS[day]}`}
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="time"
                      value={newTime[day] ?? '09:00'}
                      onChange={(e) => setNewTime((t) => ({ ...t, [day]: e.target.value }))}
                      className="h-7 w-[110px] text-xs"
                      aria-label={`New time for ${WEEKDAYS[day]}`}
                    />
                    <Button size="icon-sm" variant="ghost" onClick={() => addSlot(day)} aria-label={`Add time on ${WEEKDAYS[day]}`}>
                      <Plus />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
        {canManage && dirty && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSlots(queue.slots.map((s) => ({ dayOfWeek: s.dayOfWeek, time: s.time })))}>
              Discard
            </Button>
            <Button variant="primary" loading={busy === 'slots'} onClick={() => call('slots', () => api<Queue>(`${apiBase}/slots`, { method: 'PUT', body: { slots } }), 'Posting schedule saved')}>
              Save schedule
            </Button>
          </div>
        )}
        {!canManage && <p className="text-xs text-muted">Only owners and admins can change the posting schedule.</p>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">Up next in the queue</h2>
            <p className="text-[13px] text-muted">{queue.queued.length} queued post{queue.queued.length === 1 ? '' : 's'}</p>
          </div>
          {canCreate && (
            <Button asChild variant="primary" size="sm">
              <Link href={`/w/${workspace.slug}/compose?mode=queue`}>
                <Plus /> Add to queue
              </Link>
            </Button>
          )}
        </div>
        {queue.queued.length === 0 ? (
          <EmptyState
            title="Your queue is empty"
            description={queue.nextFreeSlots[0] ? `The next free slot is ${formatDateTime(queue.nextFreeSlots[0], queue.timezone)}.` : 'Add posting times to start using the queue.'}
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {queue.queued.map((p, i) => (
              <li key={p.id}>
                <Card className="flex items-center gap-3 p-3">
                  <span className="w-6 text-center text-xs font-semibold text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/w/${workspace.slug}/publish/posts/${p.id}`} className="line-clamp-2 text-[13px] hover:underline">
                      {p.caption || <span className="italic text-muted">Media post</span>}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span className="flex -space-x-1">
                        {p.channels.map((c) => (
                          <ChannelAvatar key={c.id} name={c.name} avatarUrl={c.avatarUrl} platform={c.platform} size={18} />
                        ))}
                      </span>
                      {formatDateTime(p.scheduledAt, queue.timezone)}
                    </div>
                  </div>
                  {canPublish && (
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={i === 0 || !!busy}
                        onClick={() => call(`move-${p.id}`, () => api<Queue>(`${apiBase}/move`, { body: { postId: p.id, direction: 'up' } }))}
                        aria-label="Move up"
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={i === queue.queued.length - 1 || !!busy}
                        onClick={() => call(`move-${p.id}`, () => api<Queue>(`${apiBase}/move`, { body: { postId: p.id, direction: 'down' } }))}
                        aria-label="Move down"
                      >
                        <ArrowDown />
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ol>
        )}
        {queue.nextFreeSlots.length > 0 && (
          <p className="text-xs text-muted">Next free slots: {queue.nextFreeSlots.slice(0, 3).map((s) => formatDateTime(s, queue.timezone)).join(' · ')}</p>
        )}
      </section>
    </div>
  );
}
