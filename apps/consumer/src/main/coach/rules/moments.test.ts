import { describe, it, expect } from 'vitest';
import { MIN, active, sess, snap, T } from '../fixtures';
import { dayReady, frequentReturns, longestStretch, personalBest } from './moments';

// n separate visits to `app`, each `len` minutes, with Code in between.
const visits = (app: string, n: number, len: number) => Array.from({ length: n }, (_, i) => [
  sess(app, T(9) + i * 10 * MIN, T(9) + i * 10 * MIN + len * MIN),
  sess('Code.exe', T(9) + i * 10 * MIN + len * MIN, T(9) + (i + 1) * 10 * MIN)
]).flat();

describe('frequentReturns', () => {
  it('fires at 15 short visits, not 14, once per app per day', () => {
    expect(frequentReturns(snap({ sessions: visits('Discord', 14, 1), now: T(12) }))).toBeNull();
    const c = frequentReturns(snap({ sessions: visits('Discord', 15, 1), now: T(12) }));
    expect(c).toMatchObject({ ruleId: 'frequent_returns', kind: 'behaviour', key: 'returns:Discord:2026-09-25',
      title: "You've opened Discord 15 times today", body: 'Each time for less than two minutes.', primary: { label: 'Got it', action: 'ack' } });
  });
  it('ignores the Windows shell and Daily itself', () => {
    for (const app of ['explorer.exe', 'SearchHost.exe', 'ShellExperienceHost.exe', 'Daily.exe']) {
      expect(frequentReturns(snap({ sessions: visits(app, 20, 1), now: T(13) }))).toBeNull();
    }
  });
  it('ignores long sessions', () => {
    expect(frequentReturns(snap({ sessions: visits('Discord', 20, 3), now: T(13) }))).toBeNull();
  });
  it('counts a title change inside one visit as one visit', () => {
    const one = [sess('Discord', T(9), T(9, 0) + 30_000, '#a'), sess('Discord', T(9) + 30_000, T(9, 1), '#b')];
    const many = Array.from({ length: 8 }, (_, i) => one.map((s) => ({ ...s, startedAt: s.startedAt + i * 10 * MIN, endedAt: s.endedAt! + i * 10 * MIN }))).flat();
    expect(frequentReturns(snap({ sessions: many, now: T(12) }))).toBeNull(); // 8 visits, 16 sessions
  });
});

describe('personalBest', () => {
  it('personalBest fires only above the 30-day best and 45 min', () => {
    const today = [sess('Code.exe', T(9), T(9, 50)), sess('Chrome', T(9, 50), T(10))];
    expect(personalBest(snap({ sessions: today, bestFocusMs30d: 40 * MIN, now: T(10, 1) }))).toMatchObject({
      ruleId: 'personal_best', kind: 'win', key: 'best:2026-09-25', title: 'Your longest focus stretch this month',
      body: '50 min on Code without a break in focus.', primary: { label: 'Thanks, Sunny', action: 'ack' } });
    expect(personalBest(snap({ sessions: today, bestFocusMs30d: 55 * MIN, now: T(10, 1) }))).toBeNull(); // not a best
    expect(personalBest(snap({ sessions: [sess('Code.exe', T(9), T(9, 44))], bestFocusMs30d: 0, now: T(9, 45) }))).toBeNull(); // under 45 min
  });
  it('is broken by time away and ignores a session a crash left open', () => {
    const away = { sessions: [sess('Code.exe', T(9), T(10))], samples: [...active(T(9), 20), ...active(T(9, 40), 20)], now: T(10, 1) };
    expect(personalBest(snap(away))).toBeNull(); // two 20-min stretches, not one hour
    const crash = { sessions: [sess('Code.exe', T(9), null), sess('Chrome', T(9, 5), T(9, 6))], now: T(11) };
    expect(personalBest(snap(crash))).toBeNull();
  });
  it('once a day', () => {
    const a = personalBest(snap({ sessions: [sess('Code.exe', T(9), T(10))], now: T(10, 1) }));
    const b = personalBest(snap({ sessions: [sess('Code.exe', T(9), T(11))], now: T(11, 1) }));
    expect(a?.key).toBe(b?.key); // the gate drops a key already fired
  });
});

describe('longestStretch', () => {
  it('joins same-app pieces split by title changes or under a minute apart', () => {
    const p = (appName: string, s: number, e: number) => ({ appName, start: s, end: e });
    expect(longestStretch([p('Code.exe', T(9), T(9, 20)), p('Code.exe', T(9, 20), T(10)), p('Chrome', T(10), T(10, 5))])).toEqual({ ms: 60 * MIN, app: 'Code' });
    expect(longestStretch([])).toEqual({ ms: 0, app: '' });
  });
});

describe('dayReady', () => {
  it("fires once when today's report is ready", () => {
    expect(dayReady(snap({ reportReady: false }))).toBeNull();
    expect(dayReady(snap({ reportReady: true }))).toMatchObject({ ruleId: 'day_ready', kind: 'win', key: 'ready:2026-09-25', title: 'Your day is ready to replay' });
  });
});
