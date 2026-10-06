import { describe, expect, it } from 'vitest';
import { validateReminder, type Reminder } from '@worksight/core/reminders';
import { breakLabel, BREAK_CHOICES, formFrom, nextUpLeft, nextUpWhen, stepMinutes, stepTime, toggleDay, toInput } from './form';

describe('reminder form', () => {
  it('starts a new reminder as a valid-once-named phone-time nudge', () => {
    const f = formFrom(null);
    expect(f).toEqual({ name: '', message: '', animation: 'stretch', type: 'interval', time: '10:00', days: [1, 2, 3, 4, 5], minutes: 45, breakSec: 0 });
    expect(validateReminder(toInput({ ...f, name: 'Stretch' }))).toBeNull();
  });

  it('round-trips an existing reminder', () => {
    const r: Reminder = { id: 3, builtin: 'tea', name: 'Tea break', message: 'Kettle', animation: 'tea', schedule: { type: 'time', time: '16:00', days: [1, 2, 3, 4, 5] }, breakSec: 300, enabled: true };
    const f = formFrom(r);
    expect(f.type).toBe('time');
    expect(toInput(f, 3)).toEqual({ id: 3, name: 'Tea break', message: 'Kettle', animation: 'tea', schedule: { type: 'time', time: '16:00', days: [1, 2, 3, 4, 5] }, breakSec: 300 });
  });

  it('steps time around midnight and keeps days sorted', () => {
    expect(stepTime('23:45', 15)).toBe('00:00');
    expect(stepTime('00:00', -15)).toBe('23:45');
    expect(stepTime('13:10', 15)).toBe('13:25');
    expect(toggleDay([1, 3], 2)).toEqual([1, 2, 3]);
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('keeps the interval within 15–240 minutes', () => {
    expect(stepMinutes(15, -15)).toBe(15);
    expect(stepMinutes(240, 15)).toBe(240);
    expect(stepMinutes(45, 15)).toBe(60);
  });

  it('labels break lengths', () => {
    expect(BREAK_CHOICES.map(breakLabel)).toEqual(['No break', '30 s', '1 min', '5 min', '15 min', '30 min']);
  });

  it('words when the next clock reminder is due', () => {
    const now = Date.parse('2026-10-06T04:30:00Z'); // Tue 10:00 in Asia/Kolkata
    expect(nextUpWhen(now + 30_000, now)).toBe('now');
    expect(nextUpWhen(now + 45 * 60_000, now)).toBe('in 45m');
    expect(nextUpWhen(now + 125 * 60_000, now)).toBe('in 2h 5m');
    const late = Date.parse('2026-10-06T17:30:00Z'); // Tue 23:00
    expect(nextUpWhen(late + 90 * 60_000, late)).toBe('tomorrow');
    expect(nextUpWhen(now + 3 * 24 * 60 * 60_000, now)).toBe('on Friday');
  });

  it('words the phone-time wait', () => {
    expect(nextUpLeft(0)).toBe('due now');
    expect(nextUpLeft(-5)).toBe('due now');
    expect(nextUpLeft(60)).toBe('after 1h more of phone time');
  });
});
