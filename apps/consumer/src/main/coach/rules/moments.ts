import type { FocusSessionRow } from '@worksight/core/types';
import type { Rule } from '../snapshot';
import { hm } from '../activity';
import { displayAppName } from '../../../shared/categories';

const MIN = 60_000;
const SHORT_MS = 2 * MIN;
const RETURNS = 15;
const BEST_MIN_MS = 45 * MIN;

/** Same-app sessions joined across title changes and gaps under a minute: one visit each. */
export function visits(sessions: FocusSessionRow[], now: number): { app: string; start: number; end: number }[] {
  const out: { app: string; start: number; end: number }[] = [];
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const app = displayAppName(s.appName), end = s.endedAt ?? Math.max(s.startedAt, now);
    const last = out[out.length - 1];
    if (last && last.app === app && s.startedAt - last.end <= MIN) last.end = Math.max(last.end, end);
    else out.push({ app, start: s.startedAt, end });
  }
  return out;
}

/** The longest unbroken stretch in one app. */
export function longestStretch(sessions: FocusSessionRow[], now: number): { ms: number; app: string } {
  let best = { ms: 0, app: '' };
  for (const v of visits(sessions, now)) if (v.end - v.start > best.ms) best = { ms: v.end - v.start, app: v.app };
  return best;
}

export const frequentReturns: Rule = (s) => {
  const counts = new Map<string, number>();
  for (const v of visits(s.sessions, s.now)) if (v.end - v.start < SHORT_MS) counts.set(v.app, (counts.get(v.app) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < RETURNS) return null;
  const [app, n] = top;
  return { ruleId: 'frequent_returns', kind: 'behaviour', key: `returns:${app}:${s.date}`, mini: app, stat: `${n} times`,
    title: `You've opened ${app} ${n} times today`, body: 'Mostly for under a minute.', primary: { label: 'Got it', action: 'ack' } };
};

export const personalBest: Rule = (s) => {
  const b = longestStretch(s.sessions, s.now);
  if (b.ms < BEST_MIN_MS || b.ms <= s.bestFocusMs30d) return null;
  const d = hm(Math.round(b.ms / MIN));
  return { ruleId: 'personal_best', kind: 'win', key: `best:${s.date}`, mini: 'Personal best', stat: d,
    title: 'Your longest focus stretch this month', body: `${d} on ${b.app} without a break in focus.`, primary: { label: 'Thanks, Sunny', action: 'ack' } };
};

export const dayReady: Rule = (s) => s.reportReady
  ? { ruleId: 'day_ready', kind: 'win', key: `ready:${s.date}`, mini: 'Replay', stat: 'ready',
      title: 'Your day is ready to replay', body: 'Open Daily and tap Replay to walk back through it.', primary: { label: 'Nice', action: 'ack' } }
  : null;
