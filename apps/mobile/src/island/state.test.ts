import { describe, expect, it } from 'vitest';
import type { Reminder } from '@worksight/core/reminders';
import type { StoredReport } from '../report/store';
import { pendingReminder, pickIsland, type IslandInputs } from './state';

// Tue 6 Oct 2026 in Asia/Kolkata (vitest.setup.ts).
const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();
const reminder = (id: number, time: string, o: Partial<Reminder> = {}): Reminder =>
  ({ id, name: 'Lunch', message: 'm', animation: 'meal', breakSec: 0, enabled: true, builtin: null, schedule: { type: 'time', time, days: [1, 2, 3, 4, 5, 6, 7] }, ...o });
const report = (o: Partial<StoredReport> = {}): StoredReport =>
  ({ day: '2026-10-06', kind: 'plain', headline: '', story: null, highlights: [], plan: [], aiError: null, final: true, createdMs: at(21), ...o });
const base = (o: Partial<IslandInputs> = {}): IslandInputs =>
  ({ reminders: [], states: new Map(), handled: {}, brk: null, report: null, reportSeen: false, phone: null, ...o });

describe('pendingReminder', () => {
  it('is the clock reminder whose time passed in the last 30 minutes', () => {
    expect(pendingReminder(base({ reminders: [reminder(1, '13:00')] }), at(13, 10))?.reminder.id).toBe(1);
  });
  it('is gone after 30 minutes', () => {
    expect(pendingReminder(base({ reminders: [reminder(1, '13:00')] }), at(13, 31))).toBeNull();
  });
  it('is gone once done or handled from the Island', () => {
    const r = reminder(1, '13:00');
    expect(pendingReminder(base({ reminders: [r], states: new Map([[1, { lastFiredAt: null, lastDoneAt: at(13, 5), skipDate: null }]]) }), at(13, 10))).toBeNull();
    expect(pendingReminder(base({ reminders: [r], handled: { 1: at(13, 2) } }), at(13, 10))).toBeNull();
  });
});

describe('pickIsland', () => {
  it('prefers break over reminder over report over progress', () => {
    const r = reminder(1, '13:00', { breakSec: 300 });
    expect(pickIsland(base({ reminders: [r], brk: { reminderId: 1, startMs: at(13, 5), totalSec: 300 } }), at(13, 6)).state.phase).toBe('break');
    expect(pickIsland(base({ reminders: [r] }), at(13, 6)).state.phase).toBe('reminder');
    expect(pickIsland(base({ report: report() }), at(21, 30)).state.phase).toBe('report');
    expect(pickIsland(base({ report: report(), reportSeen: true }), at(21, 30)).state.phase).toBe('progress');
  });
  it('reminder state carries the message, its colour and whether it has a break', () => {
    const s = pickIsland(base({ reminders: [reminder(1, '13:00', { name: 'Lunch', message: 'Time to eat', animation: 'meal', breakSec: 600 })] }), at(13, 1)).state;
    expect(s).toMatchObject({ phase: 'reminder', title: 'Lunch', line: 'Time to eat', compact: 'now', color: '#BFEBD3', icon: 'fork.knife', reminderId: 1, canBreak: true });
  });
  it('break state counts down to its end', () => {
    const s = pickIsland(base({ brk: { reminderId: null, startMs: at(16), totalSec: 300 } }), at(16, 1)).state;
    expect(s).toMatchObject({ phase: 'break', title: 'Break', timerStartMs: at(16), timerEndMs: at(16, 5), compact: '', mood: 'alright' });
  });
  it('progress counts down to the next clock reminder today', () => {
    const s = pickIsland(base({ reminders: [reminder(2, '16:00', { name: 'Tea' })] }), at(15)).state;
    expect(s).toMatchObject({ phase: 'progress', title: 'Sunny today', line: 'Tea at 4:00 pm', timerEndMs: at(16), compact: '' });
  });
  it('progress with nothing left today says so', () => {
    expect(pickIsland(base(), at(15)).state).toMatchObject({ phase: 'progress', line: 'No more reminders today', timerEndMs: null });
  });
  it('report state uses the headline, or asks to write it', () => {
    expect(pickIsland(base({ report: report({ headline: 'A calm day' }) }), at(21, 30)).state).toMatchObject({ title: 'Your day is written', line: 'A calm day', compact: 'Ready', icon: 'pencil' });
    expect(pickIsland(base({ report: report() }), at(21, 30)).state.line).toBe('Tap to write today’s story');
  });
  it('fallback is always progress', () => {
    expect(pickIsland(base({ report: report() }), at(21, 30)).fallback.phase).toBe('progress');
  });
  it('with Screen Time, progress shows phone time, the goal and Sunny’s mood', () => {
    const s = pickIsland(base({ reminders: [reminder(2, '16:00', { name: 'Tea' })], phone: { min: 130, goalMin: 240 } }), at(15)).state;
    expect(s).toMatchObject({ phase: 'progress', mood: 'happy', title: 'Sunny is happy', compact: '2h 10m', line: '1h 50m left before your 4h goal · Tea at 4:00 pm', timerEndMs: at(16) });
  });
  it('with Screen Time but no milestone yet, the compact view counts down to the next reminder', () => {
    const s = pickIsland(base({ phone: { min: 0, goalMin: 240 } }), at(8)).state;
    expect(s).toMatchObject({ mood: 'glowing', compact: '', line: '4h left before your 4h goal' });
  });
});
