import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { DEFAULT_ACTION, fromResponse, handleReminderAction, SNOOZE_MS } from './actions';
import { FakeNotifier } from './fakeNotifier';
import { getStates, listReminders, waterToday } from './store';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();

async function setup() {
  const db = await makeTestDb();
  const reminders = listReminders(db);
  const id = (b: string) => reminders.find((r) => r.builtin === b)!.id;
  return { db, n: new FakeNotifier(), id };
}

describe('fromResponse', () => {
  it("reads Daily's reminder id and maps a body tap to \"open\"", () => {
    const r = { actionIdentifier: DEFAULT_ACTION, notification: { date: at(13), request: { identifier: 'rem-2-2026-10-06', content: { data: { reminderId: 2 } } } } };
    expect(fromResponse(r)).toEqual({ actionId: 'open', reminderId: 2, notificationKey: 'rem-2-2026-10-06', firedAtMs: at(13) });
    expect(fromResponse({ ...r, notification: { ...r.notification, request: { identifier: 'x', content: { data: null } } } })).toBeNull();
  });
});

describe('handleReminderAction', () => {
  it("\"I had some\" logs a glass, marks water done and clears the notification", async () => {
    const { db, n, id } = await setup();
    const open = await handleReminderAction(db, n, { actionId: 'water', reminderId: id('water'), notificationKey: 'now-1', firedAtMs: at(11) }, at(11, 1));
    expect(open).toBeNull();
    expect(waterToday(db, at(12))).toBe(1);
    expect(getStates(db).get(id('water'))?.lastDoneAt).toBe(at(11, 1));
    expect(n.dismissed).toEqual(['now-1']);
  });

  it('handles the same response only once (Review Focus 2)', async () => {
    const { db, n, id } = await setup();
    const a = { actionId: 'water', reminderId: id('water'), notificationKey: 'now-1', firedAtMs: at(11) };
    await handleReminderAction(db, n, a, at(11, 1));
    await handleReminderAction(db, n, a, at(11, 2));
    expect(waterToday(db, at(12))).toBe(1);
    const open = { actionId: 'break', reminderId: id('lunch'), notificationKey: 'rem-x', firedAtMs: at(13) };
    expect(await handleReminderAction(db, n, open, at(13, 1))).toEqual({ route: '/break', reminderId: id('lunch') });
    expect(await handleReminderAction(db, n, open, at(13, 2))).toBeNull();
  });

  it('snoozes for 15 minutes under its own key', async () => {
    const { db, n, id } = await setup();
    await handleReminderAction(db, n, { actionId: 'snooze', reminderId: id('tea'), notificationKey: 'rem-t', firedAtMs: at(16) }, at(16, 1));
    expect(n.scheduled.get(`snooze-${id('tea')}`)?.atMs).toBe(at(16, 1) + SNOOZE_MS);
  });

  it('a body tap opens the break, or Reminders for a no-break nudge; unknown reminders do nothing', async () => {
    const { db, n, id } = await setup();
    expect(await handleReminderAction(db, n, { actionId: 'open', reminderId: id('lunch'), notificationKey: 'a', firedAtMs: 1 }, at(13))).toEqual({ route: '/break', reminderId: id('lunch') });
    db.run('UPDATE reminders SET break_sec = 0 WHERE id = ?', [id('tea')]);
    expect(await handleReminderAction(db, n, { actionId: 'open', reminderId: id('tea'), notificationKey: 'b', firedAtMs: 2 }, at(16))).toEqual({ route: '/reminders' });
    expect(await handleReminderAction(db, n, { actionId: 'open', reminderId: 999, notificationKey: 'c', firedAtMs: 3 }, at(16))).toBeNull();
  });
});
