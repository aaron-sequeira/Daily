import { describe, expect, it } from 'vitest';
import { setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { noteRewrite, plusStatus, rewritesLeft } from './status';

const DAY = 86_400_000;
const at = (d: number, h = 12) => new Date(2026, 9, d, h).getTime();

describe('plusStatus', () => {
  it('describes a trial with its day and end, then a paid plan', async () => {
    const db = await makeTestDb();
    expect(plusStatus(db, at(8))).toBeNull();
    setSetting(db, 'plus_until', at(14));
    setSetting(db, 'plus_plan', 'yearly');
    setSetting(db, 'plus_trial', '1');
    setSetting(db, 'plus_renews', '1');
    expect(plusStatus(db, at(9))).toMatchObject({ title: 'Your free week', sub: 'Day 3 of 7 · Yearly plan', trialDay: 3, monthly: false }); // started 7 Oct
    setSetting(db, 'plus_trial', '0');
    setSetting(db, 'plus_until', at(14) + 364 * DAY);
    expect(plusStatus(db, at(10))).toMatchObject({ title: 'You’re on Daily Plus', sub: 'Yearly · renews 13 Oct 2027', trialDay: null });
    setSetting(db, 'plus_renews', '0');
    expect(plusStatus(db, at(10))!.sub).toBe('Yearly · ends 13 Oct 2027');
    setSetting(db, 'plus_plan', 'monthly');
    expect(plusStatus(db, at(10))!.monthly).toBe(true);
  });

  it('counts rewrites left today (3 a day, resets at midnight)', async () => {
    const db = await makeTestDb();
    expect(rewritesLeft(db, at(8))).toBe(3);
    noteRewrite(db, at(8));
    noteRewrite(db, at(8, 13));
    expect(rewritesLeft(db, at(8))).toBe(1);
    expect(rewritesLeft(db, at(9))).toBe(3);
  });
});
