import type { ReportInput, ReportOut, WeekInput, WeekOut } from './contract.ts';

// Ported from the desktop writer (apps/consumer/src/main/report/schema.ts); the function can't import across the repo.
const DURATION_RE = /\b(\d+(?:\.\d+)?)\s*-?\s*(minutes|minute|mins|min|hours|hour|hrs|hr|h)\b/gi;
const BARE_MIN_RE = /\b(\d+(?:\.\d+)?)\s*m(?![a-zA-Z²³])/g;
const COMBINED_DURATION_RE = /\b(\d+)\s*h(?:ours?|rs?)?\s*(?:and\s*)?(\d+)\s*m(?:in(?:ute)?s?)?\b/gi;
const toMinutes = (n: number, unit: string): number => (unit.toLowerCase().startsWith('h') ? n * 60 : n);

/** Round targets a "Tomorrow, try" item may suggest ("Leave Instagram after 20 minutes"): advice, not a claim about the day. */
export const TIP_TARGETS = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120];

/** True when `text` mentions a duration that isn't within ±1 minute of one of `allowed`. */
export function ungrounded(text: string, allowed: number[]): boolean {
  const ok = (mins: number) => allowed.some((a) => Math.abs(a - mins) <= 1);
  COMBINED_DURATION_RE.lastIndex = 0;
  let rest = text;
  let c: RegExpExecArray | null;
  while ((c = COMBINED_DURATION_RE.exec(text))) {
    if (!ok(parseInt(c[1], 10) * 60 + parseInt(c[2], 10))) return true;
    rest = rest.slice(0, c.index) + ' '.repeat(c[0].length) + rest.slice(c.index + c[0].length); // so "5h" isn't re-checked alone
  }
  DURATION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DURATION_RE.exec(rest))) if (!ok(toMinutes(parseFloat(m[1]), m[2]))) return true;
  BARE_MIN_RE.lastIndex = 0;
  while ((m = BARE_MIN_RE.exec(rest))) if (!ok(parseFloat(m[1]))) return true;
  return false;
}

export function reportNumbers(i: ReportInput): number[] {
  const avg = i.last7.length ? Math.round(i.last7.reduce((t, d) => t + d.phoneMin, 0) / i.last7.length) : null;
  return [
    i.phoneMin, i.goalMin, Math.abs(i.goalMin - i.phoneMin), i.pickups, i.water, i.late.minutes,
    ...i.apps.flatMap((a) => [a.minutes, a.opens]),
    ...Object.values(i.categories).filter((n): n is number => n !== undefined),
    ...i.hourly, ...i.last7.map((d) => d.phoneMin),
    ...(i.longest ? [i.longest.minutes] : []), ...(i.quietest ? [i.quietest.minutes] : []),
    ...(avg === null ? [] : [avg, Math.abs(i.phoneMin - avg)])
  ];
}

export function weekNumbers(i: WeekInput): number[] {
  return [
    i.avgMin, ...(i.lastAvgMin === null ? [] : [i.lastAvgMin, Math.abs(i.avgMin - i.lastAvgMin)]),
    ...i.days.map((d) => d.phoneMin), ...i.topApps.map((a) => a.minutes)
  ];
}

const clean = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && s.length <= max ? s : null;
};

/** The model's report, or null when it is malformed or claims a duration the data doesn't have.
 * A bad story sentence is dropped (like the desktop); a bad headline or tip fails the whole answer. */
export function checkReport(raw: unknown, input: ReportInput): ReportOut | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const headline = clean(r.headline, 120);
  const story = clean(r.story, 600);
  const tips = Array.isArray(r.tomorrow) && r.tomorrow.length === 2 ? r.tomorrow.map((t) => clean(t, 80)) : null;
  if (!headline || !story || !tips || tips.some((t) => t === null)) return null;
  const allowed = reportNumbers(input);
  if (ungrounded(headline, allowed) || tips.some((t) => ungrounded(t!, [...allowed, ...TIP_TARGETS]))) return null;
  const kept = story.split(/(?<=[.!?])\s+/).filter((s) => !ungrounded(s, allowed)).join(' ').trim();
  return kept ? { headline, story: kept, tomorrow: tips as string[] } : null;
}

export function checkWeek(raw: unknown, input: WeekInput): WeekOut | null {
  const sentence = typeof raw === 'object' && raw !== null ? clean((raw as Record<string, unknown>).sentence, 200) : null;
  return sentence && !ungrounded(sentence, weekNumbers(input)) ? { sentence } : null;
}
