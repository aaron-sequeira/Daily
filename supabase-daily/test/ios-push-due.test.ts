import { describe, expect, it } from 'vitest';
import { dueEvents, localNow, type IosSchedule } from '../supabase/functions/ios-push/due.ts';

const state = (phase: string) => ({ phase, title: phase });
const schedule: IosSchedule = {
  tz: 'Asia/Kolkata', morning: '07:00', windDown: '23:00', writeTime: '21:00',
  progress: state('progress'), report: state('report'),
  reminders: [
    { id: 1, time: '13:00', days: [1, 2, 3, 4, 5], state: state('reminder'), title: 'Lunch', body: 'Step away from the screen.' },
    { id: 2, time: '19:30', days: [6, 7], state: state('reminder'), title: 'Dinner', body: 'Time to eat.' }
  ]
};
// Tue 6 Oct 2026 HH:MM in Asia/Kolkata (UTC+5:30), as an absolute instant.
const ist = (h: number, m = 0, d = 6) => Date.UTC(2026, 9, d, h, m) - 330 * 60_000;

describe('localNow', () => {
  it('reads the local date, minute of day and Monday-first weekday in the user’s zone', () => {
    expect(localNow(ist(13, 5), 'Asia/Kolkata')).toEqual({ date: '2026-10-06', minute: 13 * 60 + 5, weekday: 2 });
    expect(localNow(ist(0, 30, 11), 'Asia/Kolkata')).toEqual({ date: '2026-10-11', minute: 30, weekday: 7 });
  });
  it('falls back to UTC for an unknown zone', () => {
    expect(localNow(Date.UTC(2026, 9, 6, 8, 0), 'Not/AZone').minute).toBe(8 * 60);
  });
});

describe('dueEvents', () => {
  const keys = (nowMs: number, hasActivity = false) => dueEvents(schedule, nowMs, hasActivity).map((e) => `${e.key}:${e.action}`);

  it('starts Sunny in the morning when no activity is running', () => {
    expect(keys(ist(7, 0))).toEqual(['start:2026-10-06:start']);
    expect(keys(ist(7, 0), true)).toEqual([]);
  });

  it('a weekday reminder starts or updates the activity, with an alert, then returns to progress 30 min later', () => {
    const at = dueEvents(schedule, ist(13, 1), true);
    expect(at).toEqual([{ key: 'rem:1:2026-10-06', action: 'update', state: state('reminder'), alert: { title: 'Lunch', body: 'Step away from the screen.' } }]);
    expect(keys(ist(13, 1), false)).toEqual(['rem:1:2026-10-06:start']);
    expect(keys(ist(13, 31), true)).toEqual(['back:1:2026-10-06:update']);
    expect(keys(ist(13, 31), false)).toEqual([]); // nothing to bring back
  });

  it('skips reminders on other days', () => {
    expect(keys(ist(19, 30), true)).toEqual([]); // Dinner is weekends only
  });

  it('is due for 10 minutes, so a late or skipped tick still sends it (the key stops repeats)', () => {
    expect(keys(ist(13, 9), true)).toEqual(['rem:1:2026-10-06:update']);
    expect(keys(ist(13, 11), true)).toEqual([]);
    expect(keys(ist(12, 59), true)).toEqual([]);
  });

  it('says the day is written at the report time, then ends at wind-down', () => {
    expect(keys(ist(21, 0), true)).toEqual(['report:2026-10-06:update']);
    expect(keys(ist(23, 0), true)).toEqual(['end:2026-10-06:end']);
    expect(keys(ist(23, 0), false)).toEqual([]);
  });

  it('ends 30 min after the report when the report comes after wind-down', () => {
    const late = { ...schedule, writeTime: '23:30' };
    expect(dueEvents(late, ist(23, 0), true).map((e) => e.key)).toEqual([]);
    expect(dueEvents(late, ist(23, 30), true).map((e) => e.key)).toEqual(['report:2026-10-06']);
    expect(dueEvents(late, ist(23, 59), true).map((e) => e.key)).toEqual([]);
    expect(dueEvents({ ...late, writeTime: '22:00', windDown: '21:45' }, ist(22, 30), true).map((e) => e.key)).toEqual(['end:2026-10-06']);
  });
});
