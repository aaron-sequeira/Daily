import { describe, expect, it } from 'vitest';
import { getSetting, setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { noteRewrite, noteRewriteLimit, plusStatus, rewritesLeft } from './status';

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

  it('has no end date for a lifetime plan, a stale cache or the developer switch, and clamps the trial day', async () => {
    const db = await makeTestDb();
    setSetting(db, 'plus_until', -1);
    setSetting(db, 'plus_plan', 'yearly');
    expect(plusStatus(db, at(9))!.sub).toBe('Yearly');
    setSetting(db, 'plus_until', 0);
    setSetting(db, 'dev_plus', '1');
    expect(plusStatus(db, at(9))!.sub).toBe('Yearly');
    setSetting(db, 'plus_trial', '1');
    setSetting(db, 'plus_until', at(1)); // a stale cached trial: never "Day 7 of 7"
    expect(plusStatus(db, at(9))).toMatchObject({ title: 'You’re on Daily Plus', sub: 'Yearly', trialDay: null });
    setSetting(db, 'dev_plus', '0');
    setSetting(db, 'plus_until', at(14));
    expect(plusStatus(db, at(7, 13))).toMatchObject({ trialDay: 1 });
    expect(plusStatus(db, at(14, 11))).toMatchObject({ trialDay: 7 });
    expect(plusStatus(db, at(1))).toMatchObject({ trialDay: 1 }); // before the trial began: clamped
  });

  it('counts rewrites left per UTC day, like the server (3 a day)', async () => {
    const db = await makeTestDb();
    const beforeUtcMidnight = Date.parse('2026-10-08T22:30:00Z'); // 04:00 IST on 9 Oct
    const afterUtcMidnight = Date.parse('2026-10-09T00:30:00Z'); // 06:00 IST on 9 Oct
    expect(rewritesLeft(db, beforeUtcMidnight)).toBe(3);
    noteRewrite(db, beforeUtcMidnight);
    noteRewrite(db, beforeUtcMidnight + 1000);
    expect(rewritesLeft(db, beforeUtcMidnight)).toBe(1);
    expect(rewritesLeft(db, afterUtcMidnight)).toBe(3);
  });

  it('shows no rewrites left once the server says limit, and never counts past it', async () => {
    const db = await makeTestDb();
    noteRewriteLimit(db, at(8));
    expect(rewritesLeft(db, at(8))).toBe(0);
    noteRewrite(db, at(8));
    expect(rewritesLeft(db, at(8))).toBe(0);
    expect(getSetting(db, 'rewrites_today').split('|')[1]).toBe('3');
  });
});
