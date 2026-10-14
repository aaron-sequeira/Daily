import { describe, expect, it } from 'vitest';
import { setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { saveMilestones, stDayMin } from './store';

// Tue 6 Oct 2026 in Asia/Kolkata (vitest.setup.ts).
const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();

describe('Screen Time milestone store', () => {
  it('keeps each milestone once, by local day', async () => {
    const db = await makeTestDb();
    saveMilestones(db, [{ min: 24, atMs: at(9) }, { min: 48, atMs: at(10) }]);
    saveMilestones(db, [{ min: 24, atMs: at(9) }, { min: 72, atMs: at(11) }, { min: 30, atMs: at(23, 0, 5) }]);
    expect(stDayMin(db, '2026-10-06')).toBe(72);
    expect(stDayMin(db, '2026-10-05')).toBe(30);
    expect(stDayMin(db, '2026-10-04')).toBe(0);
  });
  it('logs Sunny’s mood at each milestone (for the day report), only when it changes', async () => {
    const db = await makeTestDb();
    setSetting(db, 'goal_min', 240);
    saveMilestones(db, [{ min: 24, atMs: at(9) }, { min: 60, atMs: at(10) }, { min: 130, atMs: at(12) }, { min: 200, atMs: at(15) }]);
    expect(db.all<{ mood: string }>('SELECT mood FROM mood_log WHERE day = ? ORDER BY ts_ms', ['2026-10-06']).map((r) => r.mood)).toEqual(['glowing', 'happy', 'alright']);
  });
});
