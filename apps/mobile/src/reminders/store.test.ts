import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { deleteEverything } from '../settings/data';
import {
  deleteReminder, getReminder, getStates, listReminders, logWater, markDone, markFired, saveReminder, setEnabled, skipToday, turnOffBuiltins, waterToday
} from './store';

const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();
const custom = { name: 'Stretch', message: 'Up you get', animation: 'stretch' as const, schedule: { type: 'interval' as const, minutes: 45 }, breakSec: 0 };

describe('reminder store', () => {
  it('seeds the four built-ins once', async () => {
    const db = await makeTestDb();
    expect(listReminders(db).map((r) => r.builtin)).toEqual(['water', 'lunch', 'tea', 'dinner']);
    expect(listReminders(db)).toHaveLength(4);
    expect(listReminders(db).find((r) => r.builtin === 'tea')!.breakSec).toBe(300);
  });

  it('saves, edits and deletes a custom reminder; built-ins cannot be deleted', async () => {
    const db = await makeTestDb();
    listReminders(db);
    const saved = saveReminder(db, custom);
    expect(saved.ok).toBe(true);
    const id = (saved as { ok: true; id: number }).id;
    expect(getReminder(db, id)).toMatchObject({ builtin: null, name: 'Stretch', enabled: true, schedule: { type: 'interval', minutes: 45 } });
    expect(saveReminder(db, { ...custom, id, name: 'Walk' })).toEqual({ ok: true, id });
    expect(getReminder(db, id)!.name).toBe('Walk');
    const water = listReminders(db).find((r) => r.builtin === 'water')!;
    expect(deleteReminder(db, water.id)).toBe(false);
    expect(deleteReminder(db, id)).toBe(true);
    expect(getReminder(db, id)).toBeNull();
  });

  it('rejects invalid input and a 21st custom reminder', async () => {
    const db = await makeTestDb();
    expect(saveReminder(db, { ...custom, name: '  ' })).toEqual({ ok: false, error: 'Give it a name.' });
    for (let i = 0; i < 20; i++) expect(saveReminder(db, { ...custom, name: `R${i}` }).ok).toBe(true);
    expect(saveReminder(db, { ...custom, name: 'One too many' })).toEqual({ ok: false, error: 'You can have up to 20 of your own reminders.' });
  });

  it('switches reminders on and off', async () => {
    const db = await makeTestDb();
    const dinner = listReminders(db).find((r) => r.builtin === 'dinner')!;
    setEnabled(db, dinner.id, true);
    expect(getReminder(db, dinner.id)!.enabled).toBe(true);
  });

  it('records fired, done and skip-today state', async () => {
    const db = await makeTestDb();
    const lunch = listReminders(db).find((r) => r.builtin === 'lunch')!;
    markFired(db, lunch.id, at(13));
    markDone(db, lunch.id, at(13, 20));
    skipToday(db, lunch.id, at(9));
    expect(getStates(db).get(lunch.id)).toEqual({ lastFiredAt: at(13), lastDoneAt: at(13, 20), skipDate: '2026-10-06' });
  });

  it("counts today's glasses of water", async () => {
    const db = await makeTestDb();
    logWater(db, at(9));
    logWater(db, at(11));
    logWater(db, at(9, 0, 5));
    expect(waterToday(db, at(12))).toBe(2);
  });

  it('comes back to the defaults after Delete everything', async () => {
    const db = await makeTestDb();
    saveReminder(db, custom);
    deleteEverything(db, at(12));
    expect(listReminders(db).map((r) => r.builtin)).toEqual(['water', 'lunch', 'tea', 'dinner']);
  });

  it('can switch all built-ins off (onboarding "Not now")', async () => {
    const db = await makeTestDb();
    saveReminder(db, custom);
    turnOffBuiltins(db);
    const all = listReminders(db);
    expect(all.filter((r) => r.builtin).every((r) => !r.enabled)).toBe(true);
    expect(all.find((r) => !r.builtin)!.enabled).toBe(true);
  });
});
