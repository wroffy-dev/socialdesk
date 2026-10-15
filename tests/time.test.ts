import { describe, expect, it } from 'vitest';
import { fromFloating, toFloating, upcomingSlotInstants, utcToWall, zonedToUtc } from '@/lib/time';

describe('timezone conversion', () => {
  it('converts wall time in Kolkata (UTC+5:30) to UTC', () => {
    expect(zonedToUtc('2026-10-14', '18:00', 'Asia/Kolkata').toISOString()).toBe('2026-10-14T12:30:00.000Z');
  });

  it('handles DST in New York', () => {
    expect(zonedToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedToUtc('2026-12-01', '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
    // 02:30 does not exist on 2026-03-08 in New York; it moves forward.
    const skipped = zonedToUtc('2026-03-08', '02:30', 'America/New_York');
    expect(utcToWall(skipped, 'America/New_York').time).toBe('03:30');
  });

  it('round-trips through wall time', () => {
    const at = new Date('2026-10-14T23:45:00Z');
    const w = utcToWall(at, 'Asia/Kolkata');
    expect(w).toMatchObject({ date: '2026-10-15', time: '05:15' });
    expect(zonedToUtc(w.date, w.time, 'Asia/Kolkata').toISOString()).toBe(at.toISOString());
  });

  it('round-trips floating dates used by the calendar', () => {
    const at = new Date('2026-10-14T12:30:00Z');
    const floating = toFloating(at, 'Asia/Kolkata');
    expect(floating.toISOString()).toBe('2026-10-14T18:00:00.000Z');
    expect(fromFloating(floating, 'Asia/Kolkata').toISOString()).toBe(at.toISOString());
  });

  it('lists upcoming weekly queue slots in the workspace timezone', () => {
    // Wednesday 2026-10-14 12:00 UTC = 17:30 IST
    const from = new Date('2026-10-14T12:00:00Z');
    const slots = [
      { dayOfWeek: 3, time: '09:30' },
      { dayOfWeek: 3, time: '18:00' },
      { dayOfWeek: 4, time: '09:30' },
    ];
    const next = upcomingSlotInstants(slots, 'Asia/Kolkata', from, 3).map((d) => d.toISOString());
    expect(next).toEqual(['2026-10-14T12:30:00.000Z', '2026-10-15T04:00:00.000Z', '2026-10-21T04:00:00.000Z']);
  });
});
