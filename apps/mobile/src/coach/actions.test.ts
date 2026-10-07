import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { getNumber } from '../db/settings';
import { FakeNotifier } from '../reminders/fakeNotifier';
import { COACH_SNOOZE_MS, handleCoachResponse, isCoachResponse } from './actions';

const response = (actionIdentifier: string, coach = true) => ({
  actionIdentifier,
  notification: { date: 1, request: { identifier: 'coach-stretch', content: { data: coach ? { coach: true } : { reminderId: 3 } } } }
});

describe('coach responses', () => {
  it('recognises coach notifications', () => {
    expect(isCoachResponse(response('coach-snooze'))).toBe(true);
    expect(isCoachResponse(response('snooze', false))).toBe(false);
  });

  it('"Snooze 1 h" silences nudges for an hour and clears the notification', async () => {
    const db = await makeTestDb();
    const n = new FakeNotifier();
    await handleCoachResponse(db, n, response('coach-snooze'), 1_000);
    expect(getNumber(db, 'coach_snooze_until')).toBe(1_000 + COACH_SNOOZE_MS);
    expect(n.dismissed).toEqual(['coach-stretch']);
  });

  it('handles the same response only once, but a newer one still counts', async () => {
    const db = await makeTestDb();
    const n = new FakeNotifier();
    await handleCoachResponse(db, n, response('coach-snooze'), 1_000);
    await handleCoachResponse(db, n, response('coach-snooze'), 5_000_000); // replayed on app open
    expect(getNumber(db, 'coach_snooze_until')).toBe(1_000 + COACH_SNOOZE_MS);
    const later = response('coach-snooze');
    later.notification.date = 2;
    await handleCoachResponse(db, n, later, 5_000_000);
    expect(getNumber(db, 'coach_snooze_until')).toBe(5_000_000 + COACH_SNOOZE_MS);
  });

  it('a tap on the body changes nothing', async () => {
    const db = await makeTestDb();
    await handleCoachResponse(db, new FakeNotifier(), response('expo.modules.notifications.actions.DEFAULT'), 1_000);
    expect(getNumber(db, 'coach_snooze_until')).toBe(0);
  });
});
