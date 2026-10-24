import type { Rule, Snapshot } from '../snapshot';
import { screenPieces } from '../../day/today';
import { hm } from '../activity';
import { displayAppName } from '../../../shared/categories';

const MIN = 60_000;
const SHORT_MS = 2 * MIN;
const RETURNS = 15;
const BEST_MIN_MS = 45 * MIN;
// The Windows shell (desktop, Alt-Tab, Start, search) and Daily itself: "opening" them isn't a habit worth a pop-up.
const SHELL = /^(explorer|searchhost|searchapp|shellexperiencehost|startmenuexperiencehost|applicationframehost|textinputhost|lockapp|daily|electron)(\.exe)?$/i;

type Span = { appName: string; start: number; end: number };
/** Today's on-screen pieces: idle-aware, crash leftovers dropped (Today's rules). */
const today = (s: Snapshot): Span[] => screenPieces({ date: s.date, sessions: s.sessions, samples: s.samples }, s.now, true);

/** Same-app pieces joined across title changes and gaps under a minute: one visit each. */
export function visits(pieces: Span[]): { raw: string; app: string; start: number; end: number }[] {
  const out: { raw: string; app: string; start: number; end: number }[] = [];
  for (const p of [...pieces].sort((a, b) => a.start - b.start)) {
    const app = displayAppName(p.appName);
    const last = out[out.length - 1];
    if (last && last.app === app && p.start - last.end <= MIN) last.end = Math.max(last.end, p.end);
    else out.push({ raw: p.appName.trim(), app, start: p.start, end: p.end });
  }
  return out;
}

/** The longest unbroken stretch in one app (pieces are idle-aware, so time away breaks it). */
export function longestStretch(pieces: Span[]): { ms: number; app: string } {
  let best = { ms: 0, app: '' };
  for (const v of visits(pieces)) if (v.end - v.start > best.ms) best = { ms: v.end - v.start, app: v.app };
  return best;
}

export const frequentReturns: Rule = (s) => {
  const counts = new Map<string, number>();
  for (const v of visits(today(s))) if (v.end - v.start < SHORT_MS && !SHELL.test(v.raw)) counts.set(v.app, (counts.get(v.app) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < RETURNS) return null;
  const [app, n] = top;
  return { ruleId: 'frequent_returns', kind: 'behaviour', key: `returns:${app}:${s.date}`, mini: app, stat: `${n} times`,
    title: `You've opened ${app} ${n} times today`, body: 'Each time for less than two minutes.', primary: { label: 'Got it', action: 'ack' } };
};

export const personalBest: Rule = (s) => {
  const b = longestStretch(today(s));
  if (b.ms < BEST_MIN_MS || b.ms <= s.bestFocusMs30d) return null;
  const d = hm(Math.round(b.ms / MIN));
  return { ruleId: 'personal_best', kind: 'win', key: `best:${s.date}`, mini: 'Personal best', stat: d,
    title: 'Your longest focus stretch this month', body: `${d} on ${b.app} without a break in focus.`, primary: { label: 'Thanks, Sunny', action: 'ack' } };
};

export const dayReady: Rule = (s) => s.reportReady
  ? { ruleId: 'day_ready', kind: 'win', key: `ready:${s.date}`, mini: 'Replay', stat: 'ready',
      title: 'Your day is ready to replay', body: 'Open Daily and tap Replay to walk back through it.', primary: { label: 'Nice', action: 'ack' } }
  : null;
