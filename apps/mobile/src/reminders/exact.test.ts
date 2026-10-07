import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { getSetting, setSetting } from '../db/settings';
import { noteExactAlarms } from './exact';

describe('noteExactAlarms', () => {
  it('clears the saved clock plan only when the permission changes', async () => {
    const db = await makeTestDb();
    setSetting(db, 'clock_plan', 'planned');
    expect(noteExactAlarms(db, false)).toBe(true);   // first sighting
    expect(getSetting(db, 'clock_plan')).toBe('');
    setSetting(db, 'clock_plan', 'planned');
    expect(noteExactAlarms(db, false)).toBe(false);  // unchanged
    expect(getSetting(db, 'clock_plan')).toBe('planned');
    expect(noteExactAlarms(db, true)).toBe(true);    // user allowed exact alarms
    expect(getSetting(db, 'clock_plan')).toBe('');
  });
});
