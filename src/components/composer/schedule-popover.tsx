'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock, ListOrdered, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { TimezoneSelect } from '@/components/workspace/timezone-select';
import { formatInTz, formatTime12, utcToWall, zonedToUtc } from '@/lib/time';
import { MiniCalendar } from './mini-calendar';
import type { ScheduleAction } from './types';

export interface ScheduleValue {
  date: string;
  time: string;
  tz: string;
}

/** Split action: pick a date/time (workspace timezone by default), queue it, or publish now. */
export function SchedulePopover({
  initial,
  nextQueueSlot,
  disabled,
  busy,
  onSubmit,
  label = 'Schedule',
}: {
  initial: ScheduleValue;
  nextQueueSlot: string | null;
  disabled?: boolean;
  busy?: boolean;
  onSubmit: (action: ScheduleAction) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);

  const today = utcToWall(new Date(), value.tz).date;
  const at = useMemo(() => zonedToUtc(value.date, value.time, value.tz), [value]);
  const inPast = at.getTime() < Date.now() + 60_000;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="primary" disabled={disabled} loading={busy}>
          <CalendarClock /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[300px] p-4">
        <MiniCalendar value={value.date} min={today} onChange={(date) => setValue((v) => ({ ...v, date }))} />
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13px]">
            <Clock className="size-4 text-muted" />
            <span className="w-12 text-muted">Time</span>
            <Input type="time" value={value.time} onChange={(e) => setValue((v) => ({ ...v, time: e.target.value }))} className="h-8 flex-1" aria-label="Time" />
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <span className="w-[72px] text-muted">Timezone</span>
            <TimezoneSelect value={value.tz} onChange={(e) => setValue((v) => ({ ...v, tz: e.target.value }))} className="h-8 flex-1 text-[13px]" aria-label="Timezone" />
          </label>
          {inPast && <p className="text-xs text-danger">Pick a time at least a minute from now.</p>}
          <Button
            variant="primary"
            disabled={inPast}
            onClick={() => {
              onSubmit({ type: 'schedule', scheduledAt: at.toISOString(), timezone: value.tz });
              setOpen(false);
            }}
          >
            Schedule for {formatInTz(at, value.tz, { month: 'short', day: 'numeric' })}, {formatTime12(value.time)}
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
          <Button
            variant="ghost"
            className="justify-start"
            disabled={!nextQueueSlot}
            onClick={() => {
              onSubmit({ type: 'queue' });
              setOpen(false);
            }}
          >
            <ListOrdered /> Add to queue
            {nextQueueSlot && <span className="ml-auto text-xs text-muted">{formatInTz(nextQueueSlot, value.tz, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>}
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => {
              onSubmit({ type: 'publish_now' });
              setOpen(false);
            }}
          >
            <Send /> Publish now
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
