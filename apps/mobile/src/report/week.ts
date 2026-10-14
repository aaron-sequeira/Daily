import { localDate } from '@worksight/core/date';
import { stDayMin } from '../screentime/store';
import type { Db } from '../db/db';
import { formatDuration as f } from '../format';
import type { Category } from '../tracking/categories';
import { shiftDay, weekdayShort } from './days';
import { appMeta, daySpans } from './input';

export type WeekDay = { day: string; label: string; phoneMin: number; byCat: Partial<Record<Category, number>>; isToday: boolean; future: boolean };
export type WeekApp = { name: string; category: Category; minutes: number };
export type WeekView = {
  weekStart: string; days: WeekDay[]; avgMin: number | null; lastAvgMin: number | null; deltaMin: number | null;
  topApps: WeekApp[]; sentence: string; complete: boolean;
};
/** What the server gets for the AI week sentence. Mirrored by supabase-daily/…/contract.ts. */
export type WeekInput = { weekStart: string; avgMin: number; lastAvgMin: number | null; days: { day: string; phoneMin: number }[]; topApps: { name: string; minutes: number }[] };

const MIN = 60_000;

function totals(db: Db, weekStart: string, nowMs: number) {
  const today = localDate(nowMs);
  const perApp = new Map<string, number>();
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = shiftDay(weekStart, i);
    const future = day > today;
    const spans = future ? [] : daySpans(db, day, nowMs);
    const meta = appMeta(db, spans.map((s) => s.pkg));
    const catMs = new Map<Category, number>();
    let ms = 0;
    for (const s of spans) {
      const d = s.end - s.start;
      ms += d;
      catMs.set(meta.get(s.pkg)!.category, (catMs.get(meta.get(s.pkg)!.category) ?? 0) + d);
      perApp.set(s.pkg, (perApp.get(s.pkg) ?? 0) + d);
    }
    const byCat: Partial<Record<Category, number>> = {};
    for (const [c, cms] of catMs) byCat[c] = Math.round(cms / MIN);
    // iPhone keeps no sessions: the day's Screen Time milestone is its phone time
    const phoneMin = Math.max(Math.round(ms / MIN), future ? 0 : stDayMin(db, day));
    days.push({ day, label: weekdayShort(day), phoneMin, byCat, isToday: day === today, future });
  }
  const counted = days.filter((d) => d.phoneMin > 0).length;
  const avg = counted ? Math.round(days.reduce((t, d) => t + d.phoneMin, 0) / counted) : null;
  return { days, perApp, counted, avg };
}

/** The free week sentence (spec §10.3). `current`: the week is still running. */
export function weekSentence(avg: number | null, lastAvg: number | null, current: boolean): string {
  if (avg === null) return current ? 'No phone time recorded this week yet.' : 'No phone time recorded that week.';
  if (lastAvg === null) return `Your daily average is ${f(avg)}.`;
  const delta = avg - lastAvg;
  if (delta <= -5) return `Down ${f(-delta)} a day vs last week.`;
  if (delta >= 5) return `Up ${f(delta)} a day vs last week.`;
  return `About the same as last week: ${f(avg)} a day.`;
}

/** Monday-start week: per-day bars by category, the daily average (over days with phone time) against last week, top 3 apps. */
export function buildWeek(db: Db, weekStart: string, nowMs: number): WeekView {
  const cur = totals(db, weekStart, nowMs);
  const prev = totals(db, shiftDay(weekStart, -7), nowMs);
  const meta = appMeta(db, [...cur.perApp.keys()]);
  const topApps = [...cur.perApp]
    .map(([pkg, ms]) => ({ ...meta.get(pkg)!, minutes: Math.round(ms / MIN / Math.max(cur.counted, 1)) }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 3);
  const complete = shiftDay(weekStart, 7) <= localDate(nowMs);
  return {
    weekStart, days: cur.days, avgMin: cur.avg, lastAvgMin: prev.avg,
    deltaMin: cur.avg !== null && prev.avg !== null ? cur.avg - prev.avg : null,
    topApps, sentence: weekSentence(cur.avg, prev.avg, !complete),
    complete
  };
}

export function weekInput(v: WeekView): WeekInput | null {
  if (v.avgMin === null) return null;
  return {
    weekStart: v.weekStart, avgMin: v.avgMin, lastAvgMin: v.lastAvgMin,
    days: v.days.filter((d) => !d.future).map((d) => ({ day: d.day, phoneMin: d.phoneMin })),
    topApps: v.topApps.map((a) => ({ name: a.name, minutes: a.minutes }))
  };
}
