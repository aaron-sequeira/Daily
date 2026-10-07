import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { routeTap } from './routeTap';

const tap = (data: Record<string, unknown>, date = 100, identifier = 'trial-reminder') => ({ actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { date, request: { identifier, content: { data } } } });

describe('routeTap', () => {
  it('opens a notification route once per tap, even though the last tap is replayed on every launch', async () => {
    const db = await makeTestDb();
    expect(routeTap(db, tap({ route: '/settings/plus' }))).toBe('/settings/plus');
    expect(routeTap(db, tap({ route: '/settings/plus' }))).toBeNull();
    expect(routeTap(db, tap({ route: '/settings/plus' }, 200))).toBe('/settings/plus');
    expect(routeTap(db, tap({ reminderId: 3 }, 300))).toBeNull();
    expect(routeTap(db, tap({ route: '/elsewhere' }, 400))).toBeNull();
    expect(routeTap(db, tap({ route: '/settings/plus' }, 200, 'other-id'))).toBe('/settings/plus'); // same date, different notification
  });
});
