import { describe, expect, it } from 'vitest';
import { setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { isPlus } from './plus';

describe('isPlus', () => {
  it('is off by default, on until plus_until, and the developer switch still works', async () => {
    const db = await makeTestDb();
    expect(isPlus(db, 1000)).toBe(false);
    setSetting(db, 'plus_until', 2000);
    expect(isPlus(db, 1000)).toBe(true);
    expect(isPlus(db, 2001)).toBe(false);
    setSetting(db, 'plus_until', -1);
    expect(isPlus(db, 9e15)).toBe(true);
    setSetting(db, 'plus_until', 0);
    setSetting(db, 'dev_plus', '1');
    expect(isPlus(db, 1000)).toBe(true);
  });

  it('keeps a renewing subscriber on Plus for 3 days past plus_until (the renewal may land late or offline)', async () => {
    const DAY = 86_400_000;
    const db = await makeTestDb();
    const until = Date.parse('2026-10-08T12:00:00Z');
    setSetting(db, 'plus_until', until);
    setSetting(db, 'plus_renews', '1');
    expect(isPlus(db, until + 1 * DAY)).toBe(true);
    expect(isPlus(db, until + 4 * DAY)).toBe(false);
    setSetting(db, 'plus_renews', '0');
    expect(isPlus(db, until + 1 * DAY)).toBe(false);
    setSetting(db, 'plus_until', 0); // no entitlement at all: renews can't bring it back
    setSetting(db, 'plus_renews', '1');
    expect(isPlus(db, 1000)).toBe(false);
  });
});
