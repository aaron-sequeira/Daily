import { describe, expect, it } from 'vitest';
import { clockShort, dayLabel, hhmm, shiftDay, timeRange, weekdayShort, weekStartOf } from './days';

describe('day helpers', () => {
  it('moves across months and finds Monday', () => {
    expect(shiftDay('2026-10-06', -1)).toBe('2026-10-05');
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(weekStartOf('2026-10-07')).toBe('2026-10-05'); // Wednesday
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05'); // Sunday
  });

  it('labels days and times the way the screens show them', () => {
    expect(dayLabel('2026-10-05')).toBe('Mon 5 Oct');
    expect(weekdayShort('2026-10-11')).toBe('Sun');
    expect(hhmm(new Date(2026, 9, 6, 7, 5).getTime())).toBe('07:05');
    expect(clockShort('23:00')).toBe('11 pm');
    expect(clockShort('09:30')).toBe('9:30 am');
    expect(timeRange('09:10', '11:40')).toBe('9:10–11:40 am');
    expect(timeRange('11:10', '13:40')).toBe('11:10 am–1:40 pm');
    expect(timeRange('12:52', '23:10')).toBe('12:52–11:10 pm');
  });
});
