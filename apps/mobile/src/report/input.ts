import type { Db } from '../db/db';
import { DEFAULTS, getNumber, getSetting } from '../db/settings';
import type { Mood } from '../sunny/mood';
import { isCategory, type Category } from '../tracking/categories';
import { dayStartMs } from '../tracking/ingest';
import { loadState } from '../tracking/sync';
import { hhmm, shiftDay } from './days';
import { loadReport, type PlanItem } from './store';

export type ReportApp = { name: string; category: Category; minutes: number; opens: number };
/** Spec §10.1 — names and numbers only. Mirrored by the server's contract (supabase-daily/…/contract.ts). */
export type ReportInput = {
  day: string; goalMin: number; phoneMin: number; pickups: number;
  apps: ReportApp[];
  categories: Partial<Record<Category, number>>;
  hourly: number[];
  longest: { app: string; category: Category; minutes: number; start: string } | null;
  quietest: { from: string; to: string; minutes: number } | null;
  late: { after: string; minutes: number };
  moods: { mood: Mood; at: string }[];
  water: number;
  last7: { day: string; phoneMin: number }[];
  yesterdayPlan: PlanItem[];
};
export type Span = { pkg: string; start: number; end: number };

const MIN = 60_000;
const HOUR = 3_600_000;
const QUIET_MIN = 30;    // shorter gaps aren't a "stretch"
const QUIET_FROM_H = 6;  // gaps that start before 6 am are sleep
const NAME_MAX = 60;     // the server refuses longer names

const mins = (ms: number) => Math.round(ms / MIN);
const overlap = (s: Span, from: number, to: number) => Math.max(0, Math.min(s.end, to) - Math.max(s.start, from));
const pick = (user: string | null | undefined, own: string | undefined): Category => (isCategory(user) ? user : isCategory(own) ? own : 'other');

/** Finished sessions of `day` plus the app still open, clipped to the day and to now. */
export function daySpans(db: Db, day: string, nowMs: number): Span[] {
  const spans = db.all<{ package: string; start_ms: number; end_ms: number }>('SELECT package, start_ms, end_ms FROM sessions WHERE day = ?', [day])
    .map((s) => ({ pkg: s.package, start: s.start_ms, end: s.end_ms }));
  const st = loadState(db);
  if (st.openPkg !== null && st.openStartMs !== null) {
    const start = Math.max(st.openStartMs, dayStartMs(day));
    const end = Math.min(nowMs, dayStartMs(shiftDay(day, 1)));
    if (end > start) spans.push({ pkg: st.openPkg, start, end });
  }
  return spans.sort((a, b) => a.start - b.start);
}

export function appMeta(db: Db, pkgs: string[]): Map<string, { name: string; category: Category }> {
  const out = new Map<string, { name: string; category: Category }>();
  for (const pkg of new Set(pkgs)) {
    const a = db.get<{ label: string; category: string; user_category: string | null }>('SELECT label, category, user_category FROM apps WHERE package = ?', [pkg]);
    out.set(pkg, { name: (a?.label?.trim() || pkg).slice(0, NAME_MAX), category: pick(a?.user_category, a?.category) });
  }
  return out;
}

/** iPhone: a day's Screen Time milestones as phone time per hour. Each step counts in the hour it was reached
 * (iOS only says when a step was crossed); an hour over 60 spills into the hours before it. */
export function milestoneHours(steps: { min: number; at_ms: number }[]): number[] {
  const hourly = Array<number>(24).fill(0);
  let prev = 0;
  for (const s of steps) {
    let add = Math.max(0, s.min - prev);
    prev = Math.max(prev, s.min);
    for (let h = new Date(s.at_ms).getHours(); add > 0 && h >= 0; h--) {
      const take = Math.min(add, 60 - hourly[h]);
      hourly[h] += take;
      add -= take;
    }
  }
  return hourly;
}

export function buildReportInput(db: Db, day: string, nowMs: number): ReportInput {
  const spans = daySpans(db, day, nowMs);
  const steps = spans.length ? [] : db.all<{ min: number; at_ms: number }>('SELECT min, at_ms FROM st_milestones WHERE day = ? ORDER BY at_ms', [day]);
  const meta = appMeta(db, spans.map((s) => s.pkg));
  const dayStart = dayStartMs(day);
  // Filled from Android's daily totals (no event log): the minutes are real, but not when they happened.
  const totalsOnly = !!db.get('SELECT 1 AS x FROM totals_days WHERE day = ?', [day]);

  const perApp = new Map<string, { ms: number; opens: number }>();
  for (const s of spans) {
    const a = perApp.get(s.pkg) ?? { ms: 0, opens: 0 };
    perApp.set(s.pkg, { ms: a.ms + (s.end - s.start), opens: a.opens + 1 });
  }
  const apps = [...perApp].map(([pkg, a]) => ({ ...meta.get(pkg)!, minutes: mins(a.ms), opens: totalsOnly ? 0 : a.opens }))
    .filter((a) => a.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
    .slice(0, 12);

  const catMs = new Map<Category, number>();
  for (const [pkg, a] of perApp) catMs.set(meta.get(pkg)!.category, (catMs.get(meta.get(pkg)!.category) ?? 0) + a.ms);
  const categories: Partial<Record<Category, number>> = {};
  for (const [c, ms] of catMs) if (mins(ms) > 0) categories[c] = mins(ms);

  // Overlapping spans can add up to more than an hour; the server refuses that.
  const hourly = Array.from({ length: 24 }, (_, h) => totalsOnly ? 0 : Math.min(60, mins(spans.reduce((t, s) => t + overlap(s, dayStart + h * HOUR, dayStart + (h + 1) * HOUR), 0))));

  const long = totalsOnly ? null : spans.reduce<Span | null>((b, s) => (!b || s.end - s.start > b.end - b.start ? s : b), null);
  const longest = long ? { app: meta.get(long.pkg)!.name, category: meta.get(long.pkg)!.category, minutes: mins(long.end - long.start), start: hhmm(long.start) } : null;

  let quietest: ReportInput['quietest'] = null;
  let reach: number | null = null; // where phone use so far ends (spans may overlap)
  for (const s of totalsOnly ? [] : spans) {
    if (reach !== null && s.start - reach >= QUIET_MIN * MIN && new Date(reach).getHours() >= QUIET_FROM_H) {
      const minutes = mins(s.start - reach);
      if (!quietest || minutes > quietest.minutes) quietest = { from: hhmm(reach), to: hhmm(s.start), minutes };
    }
    reach = reach === null ? s.end : Math.max(reach, s.end);
  }

  const windDownRaw = getSetting(db, 'wind_down');
  const windDownValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(windDownRaw) ? windDownRaw : DEFAULTS.wind_down;
  const [wh, wm] = windDownValid.split(':').map(Number);
  const lateFrom = dayStart + (wh * 60 + wm) * MIN;
  const lateTo = wh >= 5 ? dayStartMs(shiftDay(day, 1)) : dayStart + 5 * HOUR; // the night ends at 05:00 (coach/rules.ts)
  const late = { after: windDownValid, minutes: totalsOnly ? 0 : mins(spans.reduce((t, s) => t + overlap(s, lateFrom, lateTo), 0)) };
  if (steps.length) {
    // iPhone: Screen Time steps after wind-down (the step's minutes were reached in that window)
    let prev = 0;
    for (const st of steps) {
      if (st.at_ms >= lateFrom && st.at_ms < lateTo) late.minutes += Math.max(0, st.min - prev);
      prev = Math.max(prev, st.min);
    }
  }

  const count = (table: string) => db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE day = ?`, [day])?.n ?? 0;
  const last7 = Array.from({ length: 7 }, (_, i) => shiftDay(day, i - 7))
    .map((d) => ({ day: d, phoneMin: Math.max(
      mins(db.get<{ ms: number | null }>('SELECT SUM(end_ms - start_ms) AS ms FROM sessions WHERE day = ?', [d])?.ms ?? 0),
      db.get<{ m: number | null }>('SELECT MAX(min) AS m FROM st_milestones WHERE day = ?', [d])?.m ?? 0) }))
    .filter((d) => d.phoneMin > 0);

  const goalMinRaw = getNumber(db, 'goal_min');
  const goalMin = goalMinRaw > 0 && Number.isInteger(goalMinRaw) ? goalMinRaw : Number(DEFAULTS.goal_min);

  return {
    day,
    goalMin,
    phoneMin: steps.length ? Math.max(...steps.map((x) => x.min)) : mins(spans.reduce((t, s) => t + (s.end - s.start), 0)),
    pickups: count('pickups'),
    apps, categories, hourly: steps.length ? milestoneHours(steps) : hourly, longest, quietest, late,
    moods: db.all<{ mood: Mood; ts_ms: number }>('SELECT mood, ts_ms FROM mood_log WHERE day = ? ORDER BY ts_ms LIMIT 12', [day]).map((m) => ({ mood: m.mood, at: hhmm(m.ts_ms) })),
    water: Math.min(100, count('water_log')), // the server's cap
    last7,
    yesterdayPlan: loadReport(db, shiftDay(day, -1))?.plan ?? []
  };
}
