import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { deleteEverything } from '../settings/data';
import { FakeNotifier } from './fakeNotifier';
import { listReminders, saveReminder, setEnabled } from './store';
import { resetArmedForTests, tickReminders } from './tick';

const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();

async function setup() {
  const db = await makeTestDb();
  const n = new FakeNotifier();
  const byName = (b: string) => listReminders(db).find((r) => r.builtin === b)!;
  return { db, n, byName };
}

describe('tickReminders', () => {
  beforeEach(() => resetArmedForTests());
  afterEach(() => vi.restoreAllMocks());

  it('re-arms the plan once in a new process even though the plan is unchanged (force-stop cancels alarms)', async () => {
    const { db, n, byName } = await setup();
    expect((await tickReminders(db, n, at(10))).replanned).toBe(true);
    expect((await tickReminders(db, n, at(10, 1))).replanned).toBe(false);
    n.scheduled.clear(); // what a force-stop does to the real alarms
    resetArmedForTests();
    expect((await tickReminders(db, n, at(10, 2))).replanned).toBe(true);
    expect(n.scheduled.has(`rem-${byName('lunch').id}-2026-10-06`)).toBe(true);
  });

  it('schedules the 7-day clock plan once and leaves it alone while unchanged', async () => {
    const { db, n, byName } = await setup();
    const first = await tickReminders(db, n, at(10));
    expect(first.replanned).toBe(true);
    const lunch = byName('lunch');
    expect(n.scheduled.get(`rem-${lunch.id}-2026-10-06`)?.atMs).toBe(at(13));
    expect([...n.scheduled.keys()].filter((k) => k.startsWith(`rem-${lunch.id}-`))).toHaveLength(5);
    expect((await tickReminders(db, n, at(10, 1))).replanned).toBe(false);
  });

  it('replaces the old alarm when a reminder is edited or switched off (Review Focus 4)', async () => {
    const { db, n, byName } = await setup();
    await tickReminders(db, n, at(10));
    const tea = byName('tea');
    saveReminder(db, { id: tea.id, name: tea.name, message: tea.message, animation: tea.animation, schedule: { type: 'time', time: '17:00', days: [2] }, breakSec: tea.breakSec });
    await tickReminders(db, n, at(10, 1));
    expect(n.scheduled.get(`rem-${tea.id}-2026-10-06`)?.atMs).toBe(at(17));
    expect([...n.scheduled.keys()].filter((k) => k.startsWith(`rem-${tea.id}-`))).toEqual([`rem-${tea.id}-2026-10-06`]);
    setEnabled(db, tea.id, false);
    await tickReminders(db, n, at(10, 2));
    expect([...n.scheduled.keys()].some((k) => k.startsWith(`rem-${tea.id}-`))).toBe(false);
  });

  it('never cancels a snooze when re-planning (Review Focus 3)', async () => {
    const { db, n, byName } = await setup();
    await n.scheduleAt('snooze-7', { reminderId: 7, title: 't', body: 'b', category: 'break' }, at(10, 15));
    setEnabled(db, byName('dinner').id, true);
    await tickReminders(db, n, at(10));
    expect(n.scheduled.has('snooze-7')).toBe(true);
  });

  it('fires a due phone-time reminder now and only once', async () => {
    const { db, n, byName } = await setup();
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.a', ?, ?, '2026-10-06')", [at(9), at(10, 5)]);
    const first = await tickReminders(db, n, at(10, 10));
    expect(first.fired).toEqual([byName('water').id]);
    expect(n.shown.map((s) => s.content.category)).toEqual(['water']);
    expect((await tickReminders(db, n, at(10, 11))).fired).toEqual([]);
  });

  it('re-plans after Delete everything (Review Focus 5)', async () => {
    const { db, n } = await setup();
    await tickReminders(db, n, at(10));
    deleteEverything(db, at(10, 5));
    expect((await tickReminders(db, n, at(10, 6))).replanned).toBe(true);
    const lunch = listReminders(db).find((r) => r.builtin === 'lunch')!;
    expect(n.scheduled.has(`rem-${lunch.id}-2026-10-06`)).toBe(true);
  });

  it('respects canNotify permission: does not fire when denied, fires when allowed later', async () => {
    const { db, n, byName } = await setup();
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.a', ?, ?, '2026-10-06')", [at(9), at(10, 5)]);
    n.allowed = false;
    const first = await tickReminders(db, n, at(10, 10));
    expect(first.fired).toEqual([]);
    expect(n.shown).toEqual([]);
    n.allowed = true;
    const second = await tickReminders(db, n, at(10, 11));
    expect(second.fired).toEqual([byName('water').id]);
    expect(n.shown.map((s) => s.content.category)).toEqual(['water']);
  });

  it('handles scheduleAt rejection gracefully: replanned stays false, due reminder still fires', async () => {
    const { db, n, byName } = await setup();
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.a', ?, ?, '2026-10-06')", [at(9), at(10, 5)]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    n.scheduleAt = async () => { throw new Error('scheduling failed'); };
    const result = await tickReminders(db, n, at(10, 10));
    expect(result.replanned).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(result.fired).toEqual([byName('water').id]);
    expect(n.shown.map((s) => s.content.category)).toEqual(['water']);
  });

  it('handles showNow rejection: reminder not marked fired, can retry next tick', async () => {
    const { db, n, byName } = await setup();
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.a', ?, ?, '2026-10-06')", [at(9), at(10, 5)]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let shouldFail = true;
    const originalShowNow = n.showNow.bind(n);
    n.showNow = async (...args) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('show failed');
      }
      return originalShowNow(...args);
    };
    const first = await tickReminders(db, n, at(10, 10));
    expect(first.fired).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(n.shown).toEqual([]);
    const second = await tickReminders(db, n, at(10, 11));
    expect(second.fired).toEqual([byName('water').id]);
    expect(n.shown.length).toBe(1);
  });
});
