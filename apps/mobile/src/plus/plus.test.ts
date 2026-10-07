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
});
