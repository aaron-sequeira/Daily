import { describe, expect, it } from 'vitest';
import { GAP_MS, inWindDown, isQuiet, planNudge, type CoachInput, type OpenApp } from './rules';

// Tue 6 Oct 2026, Asia/Kolkata.
const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();
const insta: OpenApp = { pkg: 'com.instagram.android', label: 'Instagram', category: 'social', androidCategory: 4, startMs: at(20) };
const base: CoachInput = { nowMs: at(20, 10), open: insta, phoneMin: 60, goalMin: 240, windDown: '23:00', lastNudgeMs: null, snoozeUntilMs: 0, sentKeys: new Set() };

describe('planNudge', () => {
  it("stays quiet when nothing applies or the phone isn't in use", () => {
    expect(planNudge(base)).toBeNull();
    expect(planNudge({ ...base, nowMs: at(21), open: null, phoneMin: 300 })).toBeNull();
  });

  it('nudges after 30 minutes straight in a social or fun app, once per stretch', () => {
    const n = planNudge({ ...base, nowMs: at(20, 31) });
    expect(n).toEqual({ kind: 'stretch', key: `stretch-com.instagram.android-${at(20)}`, title: '31 minutes on Instagram', body: `That's a long stretch. A good spot to stop?` });
    expect(planNudge({ ...base, nowMs: at(20, 45), sentKeys: new Set([n!.key]) })).toBeNull();
    expect(planNudge({ ...base, nowMs: at(20, 31), open: { ...insta, category: 'work' } })).toBeNull();
  });

  it('marks 80% and 100% of the goal once a day each', () => {
    expect(planNudge({ ...base, phoneMin: 200 })).toMatchObject({ kind: 'goal80', key: 'goal80-2026-10-06', title: '40m left' });
    expect(planNudge({ ...base, phoneMin: 245 })).toMatchObject({ kind: 'goal100', key: 'goal100-2026-10-06', title: `You've reached your goal` });
    expect(planNudge({ ...base, phoneMin: 245, sentKeys: new Set(['goal100-2026-10-06']) })).toBeNull();
  });

  it('nudges once per night after wind-down, counting after midnight as the same night', () => {
    expect(planNudge({ ...base, nowMs: at(23, 5) })).toMatchObject({ kind: 'winddown', key: 'winddown-2026-10-06' });
    expect(planNudge({ ...base, nowMs: at(0, 40, 7) })).toMatchObject({ key: 'winddown-2026-10-06' });
    // a fresh 10-minute session, so the long-stretch rule doesn't apply either
    expect(planNudge({ ...base, nowMs: at(0, 40, 7), open: { ...insta, startMs: at(0, 30, 7) }, sentKeys: new Set(['winddown-2026-10-06']) })).toBeNull();
  });

  it('prefers wind-down, then goal, then stretch when several apply', () => {
    expect(planNudge({ ...base, nowMs: at(23, 40), phoneMin: 250, open: { ...insta, startMs: at(23) } })?.kind).toBe('winddown');
    expect(planNudge({ ...base, nowMs: at(20, 40), phoneMin: 250 })?.kind).toBe('goal100');
  });

  it('waits 20 minutes between nudges and respects Snooze 1 h (Review Focus 4)', () => {
    const due = { ...base, nowMs: at(20, 31) };
    expect(planNudge({ ...due, lastNudgeMs: due.nowMs - GAP_MS + 1 })).toBeNull();
    expect(planNudge({ ...due, lastNudgeMs: due.nowMs - GAP_MS })?.kind).toBe('stretch');
    expect(planNudge({ ...due, snoozeUntilMs: due.nowMs + 1 })).toBeNull();
  });

  it('never nudges during a call, navigation or music (Review Focus 3)', () => {
    const due = { ...base, nowMs: at(20, 31), phoneMin: 250 };
    expect(planNudge({ ...due, open: { ...insta, pkg: 'com.google.android.dialer' } })).toBeNull();
    expect(planNudge({ ...due, open: { ...insta, pkg: 'x.nav', androidCategory: 6 } })).toBeNull();
    expect(planNudge({ ...due, open: { ...insta, pkg: 'x.player', androidCategory: 1 } })).toBeNull();
  });
});

describe('helpers', () => {
  it('knows quiet apps', () => {
    expect(isQuiet({ ...insta, pkg: 'com.waze' })).toBe(true);
    expect(isQuiet(insta)).toBe(false);
  });
  it('finds the wind-down window, including a window that starts after midnight', () => {
    expect(inWindDown(at(22, 59), '23:00')).toBe(false);
    expect(inWindDown(at(23, 0), '23:00')).toBe(true);
    expect(inWindDown(at(4, 59, 7), '23:00')).toBe(true);
    expect(inWindDown(at(5, 0, 7), '23:00')).toBe(false);
    expect(inWindDown(at(0, 15, 7), '00:30')).toBe(false);
    expect(inWindDown(at(1, 0, 7), '00:30')).toBe(true);
  });
});
