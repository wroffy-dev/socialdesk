/**
 * Timezone helpers built on Intl only (no tz database dependency).
 * Storage is always UTC; "wall time" means a date + time as seen in a given IANA zone.
 */

export interface WallTime {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm (24h) */
  time: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function partsIn(ts: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  };
}

/** Offset of `tz` from UTC (ms) at instant `ts`. */
export function tzOffset(ts: number, tz: string): number {
  const p = partsIn(ts, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
}

/**
 * Wall time in `tz` → UTC instant. For times skipped by a DST jump the result moves forward;
 * for repeated times the earlier instant is used.
 */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const c1 = guess - tzOffset(guess, tz);
  const c2 = guess - tzOffset(c1, tz);
  const matches = (c: number) => {
    const p = partsIn(c, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) === guess;
  };
  const ok = [c1, c2].filter(matches);
  // Overlap (clocks go back): earlier instant. Gap (clocks go forward): later instant.
  return new Date(ok.length ? Math.min(...ok) : Math.max(c1, c2));
}

/** UTC instant → wall time in `tz`. */
export function utcToWall(at: Date | string | number, tz: string): WallTime & { weekday: number } {
  const p = partsIn(new Date(at).getTime(), tz);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}`, weekday: p.weekday };
}

/**
 * A "floating" Date whose UTC fields equal the wall time in `tz`. Lets calendar widgets
 * running in UTC mode display workspace-local times.
 */
export function toFloating(at: Date | string | number, tz: string): Date {
  const p = partsIn(new Date(at).getTime(), tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

export function fromFloating(floating: Date, tz: string): Date {
  const date = `${floating.getUTCFullYear()}-${pad(floating.getUTCMonth() + 1)}-${pad(floating.getUTCDate())}`;
  const time = `${pad(floating.getUTCHours())}:${pad(floating.getUTCMinutes())}`;
  return zonedToUtc(date, time, tz);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function formatInTz(at: Date | string | number, tz: string, opts: Intl.DateTimeFormatOptions, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }).format(new Date(at));
}

export function formatDateTime(at: Date | string | number, tz: string) {
  return formatInTz(at, tz, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatTime(at: Date | string | number, tz: string) {
  return formatInTz(at, tz, { hour: 'numeric', minute: '2-digit' });
}

export function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "Today · 6:00 PM", "Tomorrow · 9:00 AM", "Thu · 9:00 AM", "Oct 30 · 9:00 AM". */
export function formatUpcoming(at: Date | string | number, tz: string, now = new Date()): string {
  const target = utcToWall(at, tz).date;
  const today = utcToWall(now, tz).date;
  const days = Math.round((Date.parse(target) - Date.parse(today)) / 86_400_000);
  const time = formatTime(at, tz);
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  if (days > 1 && days < 7) return `${formatInTz(at, tz, { weekday: 'short' })} · ${time}`;
  return `${formatInTz(at, tz, { month: 'short', day: 'numeric' })} · ${time}`;
}

export function formatAgo(at: Date | string | number, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function greeting(tz: string, now = new Date()): string {
  const h = Number(utcToWall(now, tz).time.slice(0, 2));
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Next occurrences of weekly slots (in `tz`) strictly after `from`, in chronological order.
 */
export function upcomingSlotInstants(
  slots: { dayOfWeek: number; time: string }[],
  tz: string,
  from: Date,
  limit: number,
  horizonDays = 70,
): Date[] {
  if (slots.length === 0) return [];
  const out: Date[] = [];
  const start = utcToWall(from, tz).date;
  for (let i = 0; i <= horizonDays && out.length < limit; i++) {
    const date = addDays(start, i);
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const today = slots
      .filter((s) => s.dayOfWeek === weekday)
      .map((s) => zonedToUtc(date, s.time, tz))
      .filter((t) => t.getTime() > from.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    out.push(...today);
  }
  return out.slice(0, limit);
}
