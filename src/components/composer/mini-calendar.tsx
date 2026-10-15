'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDays } from '@/lib/time';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month grid (Monday first) that selects a YYYY-MM-DD string. */
export function MiniCalendar({ value, onChange, min }: { value: string; onChange: (date: string) => void; min: string }) {
  const [cursor, setCursor] = useState(() => value.slice(0, 7));
  const [y, m] = cursor.split('-').map(Number) as [number, number];

  const cells = useMemo(() => {
    const first = `${cursor}-01`;
    const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const start = addDays(first, -firstDow);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor, y, m]);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setCursor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <div className="flex gap-0.5">
          <button type="button" onClick={() => shift(-1)} className="rounded-md p-1 hover:bg-hover" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => shift(1)} className="rounded-md p-1 hover:bg-hover" aria-label="Next month">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[13px]" role="grid">
        {DOW.map((d, i) => (
          <span key={i} className="py-1 text-xs text-muted">
            {d}
          </span>
        ))}
        {cells.map((date) => {
          const outside = !date.startsWith(cursor);
          const disabled = date < min;
          const selected = date === value;
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onChange(date)}
              aria-pressed={selected}
              className={cn(
                'h-8 rounded-md font-medium tabular-nums transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:text-line-strong disabled:hover:bg-transparent',
                outside && !disabled && 'text-faint',
                date === min && !selected && 'ring-1 ring-inset ring-line-strong',
                selected && 'bg-primary text-primary-fg hover:bg-primary-hover',
              )}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
