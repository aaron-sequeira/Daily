import { describe, expect, it } from 'vitest';
import { makeTestDb } from './testDb';
import { getNumber, getSetting, setSetting } from './settings';

describe('settings', () => {
  it('returns defaults when unset', async () => {
    const db = await makeTestDb();
    expect(getNumber(db, 'goal_min')).toBe(240);
    expect(getNumber(db, 'retention_days')).toBe(90);
    expect(getSetting(db, 'onboarded')).toBe('0');
  });

  it('persists a change', async () => {
    const db = await makeTestDb();
    setSetting(db, 'goal_min', 180);
    setSetting(db, 'goal_min', 210);
    expect(getNumber(db, 'goal_min')).toBe(210);
  });
});
