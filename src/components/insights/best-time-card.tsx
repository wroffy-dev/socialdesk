'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Clock, ListPlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api-client';
import { WEEKDAYS_SHORT, formatTime12 } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { BestTimes } from '@/server/services/best-time';

/** Weekdays starting Monday for display. */
const DAYS = [1, 2, 3, 4, 5, 6, 0];

export const hourLabel = (h: number) => formatTime12(`${String(h).padStart(2, '0')}:00`);
export const slotLabel = (s: { day: number; hour: number }) => `${WEEKDAYS_SHORT[s.day]} ${hourLabel(s.hour)}`;

/** Fetches best times for the given channel filter. */
export function useBestTimes(workspaceId: string, channels: string[]) {
  const [data, setData] = useState<BestTimes | null>(null);
  const key = channels.join(',');
  useEffect(() => {
    let cancelled = false;
    const qs = key ? `?channels=${key}` : '';
    api<BestTimes>(`/api/w/${workspaceId}/best-times${qs}`)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [workspaceId, key]);
  return data;
}

/**
 * Heatmap of when this workspace's posts get the most engagement (relative to each channel's
 * typical post), with the top times and a shortcut to add them to the queue.
 */
export function BestTimeCard({ workspaceId, channels, canManageQueue }: { workspaceId: string; channels: string[]; canManageQueue: boolean }) {
  const data = useBestTimes(workspaceId, channels);
  const [busy, setBusy] = useState(false);

  const addToQueue = async () => {
    setBusy(true);
    try {
      const qs = channels.length ? `?channels=${channels.join(',')}` : '';
      const res = await api<{ added: number }>(`/api/w/${workspaceId}/best-times/queue${qs}`, { method: 'POST' });
      toast.success(res.added ? `Added ${res.added} posting time${res.added > 1 ? 's' : ''} to the queue` : 'These times are already in your queue');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const max = data ? Math.max(1, ...data.cells.map((c) => c.score)) : 1;
  const cell = (day: number, hour: number) => data?.cells.find((c) => c.day === day && c.hour === hour);

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="best-time">
      <div className="flex flex-wrap items-center gap-2">
        <Clock className="size-4 text-muted" />
        <h2 className="text-[15px] font-semibold">Best time to post</h2>
        {data?.enough && (
          <Badge variant={data.confidence === 'high' ? 'success' : data.confidence === 'medium' ? 'info' : 'warning'} title="Based on how many of your posts have insights">
            {data.confidence} confidence
          </Badge>
        )}
        {data && <span className="ml-auto text-xs text-muted">Times in {data.timezone}</span>}
      </div>

      {!data ? (
        <Skeleton className="h-40" />
      ) : !data.enough ? (
        <p className="text-[13px] text-muted">
          Not enough data yet. Recommendations are based on your own published posts and their engagement: {data.totalPosts} of the {data.minPosts} posts with
          insights needed so far. Insights sync every few hours after publishing.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {data.top.length === 0 ? (
              <p className="text-[13px] text-muted">No time slot has enough posts yet to stand out. Keep posting at different times.</p>
            ) : (
              data.top.map((t, i) => (
                <span key={`${t.day}-${t.hour}`} className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]', i === 0 ? 'border-accent-ink bg-accent-soft text-accent-ink' : 'border-line')}>
                  <strong className="font-semibold">{slotLabel(t)}</strong>
                  <span className="text-xs opacity-80">
                    {t.score.toFixed(1)}× typical · {t.posts} posts
                  </span>
                </span>
              ))
            )}
            {canManageQueue && data.top.length > 0 && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={addToQueue} loading={busy}>
                <ListPlus /> Add to queue
              </Button>
            )}
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <div className="grid min-w-[620px] grid-cols-[34px_repeat(24,minmax(0,1fr))] gap-[2px] text-[10px] text-muted" role="table" aria-label="Engagement by weekday and hour">
              <span role="columnheader" />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} role="columnheader" className="whitespace-nowrap text-left">
                  {h % 3 === 0 ? hourLabel(h).replace(':00', '') : ''}
                </span>
              ))}
              {DAYS.map((d) => (
                <div key={d} role="row" className="contents">
                  <span role="rowheader" className="self-center">
                    {WEEKDAYS_SHORT[d]}
                  </span>
                  {Array.from({ length: 24 }, (_, h) => {
                    const c = cell(d, h);
                    return (
                      <span
                        key={h}
                        role="cell"
                        className="h-5 rounded-[3px] bg-subtle"
                        style={c ? { background: `rgb(var(--accent-ink) / ${0.15 + 0.85 * (c.score / max)})` } : undefined}
                        title={c ? `${slotLabel({ day: d, hour: h })}: ${c.score.toFixed(2)}× typical engagement over ${c.posts} post${c.posts > 1 ? 's' : ''}` : `${slotLabel({ day: d, hour: h })}: no posts`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-faint">
            Based on {data.totalPosts} published posts from the last 6 months. Darker means more likes, comments, shares and saves than the channel&apos;s typical post.
          </p>
        </>
      )}
    </Card>
  );
}
