import { afterEach, describe, expect, it } from 'vitest';
import type { Reminder } from '@worksight/core/reminders';
import { dueIntervalReminders, nextUp, planClockSlots } from './plan';
import type { ReminderState } from './store';

// Tue 6 Oct 2026 in Asia/Kolkata (vitest.setup.ts).
const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();
const base = { message: 'm', animation: 'meal' as const, breakSec: 300, enabled: true, builtin: null };
const lunch: Reminder = { ...base, id: 1, name: 'Lunch', schedule: { type: 'time', time: '13:00', days: [1, 2, 3, 4, 5] } };
const water: Reminder = { ...base, id: 2, name: 'Water', animation: 'water', schedule: { type: 'interval', minutes: 60 } };
const none = new Map<number, ReminderState>();

describe('planClockSlots', () => {
  it('plans the weekday slots of the next 7 days, today included when still ahead', () => {
    const slots = planClockSlots([lunch, water], none, at(10));
    expect(slots.map((s) => s.key)).toEqual(['rem-1-2026-10-06', 'rem-1-2026-10-07', 'rem-1-2026-10-08', 'rem-1-2026-10-09', 'rem-1-2026-10-12']);
    expect(slots[0].atMs).toBe(at(13));
  });

  it('drops a slot that has passed, a skipped day and disabled reminders', () => {
    expect(planClockSlots([lunch], none, at(14))[0].key).toBe('rem-1-2026-10-07');
    const skipped = new Map<number, ReminderState>([[1, { lastFiredAt: null, lastDoneAt: null, skipDate: '2026-10-06' }]]);
    expect(planClockSlots([lunch], skipped, at(10))[0].key).toBe('rem-1-2026-10-07');
    expect(planClockSlots([{ ...lunch, enabled: false }], none, at(10))).toEqual([]);
  });

  describe('time zone change (Review Focus 1)', () => {
    const original = process.env.TZ;
    afterEach(() => { process.env.TZ = original; });
    it('re-plans to the same local time in the new zone', () => {
      const now = Date.UTC(2026, 9, 6, 3, 0); // 08:30 in Kolkata, 04:00 in London
      const kolkata = planClockSlots([lunch], none, now)[0].atMs;
      process.env.TZ = 'Europe/London';
      const london = planClockSlots([lunch], none, now)[0].atMs;
      expect(new Date(kolkata).toISOString()).toBe('2026-10-06T07:30:00.000Z');
      expect(new Date(london).toISOString()).toBe('2026-10-06T12:00:00.000Z');
    });
    it('keeps 13:00 local across the US fall-back change (25 h between slots)', () => {
      process.env.TZ = 'America/New_York';
      const everyDay: Reminder = { ...lunch, schedule: { type: 'time', time: '13:00', days: [1, 2, 3, 4, 5, 6, 7] } };
      const slots = planClockSlots([everyDay], none, new Date(2026, 9, 31, 10, 0).getTime()).slice(0, 3);
      expect(slots.map((s) => s.atMs)).toEqual([new Date(2026, 9, 31, 13).getTime(), new Date(2026, 10, 1, 13).getTime(), new Date(2026, 10, 2, 13).getTime()]);
      expect(slots[1].atMs - slots[0].atMs).toBe(25 * 3_600_000);
      expect(slots[2].atMs - slots[1].atMs).toBe(24 * 3_600_000);
    });
  });
});

describe('dueIntervalReminders', () => {
  it('fires after enough phone time since midnight, the last fire or the last done', () => {
    const since = (from: number) => (from <= at(0) ? 70 : 30) * 60_000;
    expect(dueIntervalReminders([water, lunch], none, at(12), since).map((r) => r.id)).toEqual([2]);
    const done = new Map<number, ReminderState>([[2, { lastFiredAt: null, lastDoneAt: at(11), skipDate: null }]]);
    expect(dueIntervalReminders([water], done, at(12), since)).toEqual([]);
    expect(dueIntervalReminders([{ ...water, enabled: false }], none, at(12), since)).toEqual([]);
  });
});

describe('nextUp', () => {
  const since = () => 20 * 60_000;
  it('prefers a clock reminder still to come today', () => {
    expect(nextUp([lunch, water], none, at(10), since)).toEqual({ reminder: lunch, kind: 'clock', atMs: at(13) });
  });
  it('otherwise shows the phone-time reminder with the least left', () => {
    expect(nextUp([lunch, water], none, at(14), since)).toEqual({ reminder: water, kind: 'interval', leftMin: 40 });
  });
  it('otherwise the next clock slot on a later day, or nothing', () => {
    expect(nextUp([lunch], none, at(14), since)).toEqual({ reminder: lunch, kind: 'clock', atMs: at(13, 0, 7) });
    expect(nextUp([], none, at(14), since)).toBeNull();
  });
});
