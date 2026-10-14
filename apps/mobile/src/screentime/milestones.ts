import { localDate } from '@worksight/core/date';
import { shiftDay } from '../report/days';

/** One DeviceActivity threshold event fires at each of these minutes of phone time (event name `m_<min>`). */
export type Milestone = { min: number; atMs: number };

const DAY_MIN = 24 * 60;

/** Every 10% of the goal up to 150% (Sunny's mood steps) and every full hour up to 12 h (water). */
export function thresholds(goalMin: number): number[] {
  const out = new Set<number>();
  for (let k = 1; k <= 15; k++) out.add(Math.max(1, Math.round((goalMin * k) / 10)));
  for (let h = 1; h <= 12; h++) out.add(h * 60);
  return [...out].filter((m) => m <= DAY_MIN).sort((a, b) => a - b);
}

/** iPhone phone time today, to the nearest milestone: iOS never tells Daily the exact figure. */
export function phoneMinToday(list: Milestone[], nowMs: number): number {
  const today = localDate(nowMs);
  return list.reduce((best, m) => (localDate(m.atMs) === today && m.min > best ? m.min : best), 0);
}

/** Each day's phone time (its highest milestone), by local date. */
export function dayTotals(list: Milestone[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of list) {
    const day = localDate(m.atMs);
    if (m.min > (out.get(day) ?? 0)) out.set(day, m.min);
  }
  return out;
}

/** Daily averages over the days with phone time: the Monday-start week of `weekStart` and the week before. */
export function weekAverages(list: Milestone[], weekStart: string, nowMs: number): { avg: number | null; lastAvg: number | null } {
  const days = dayTotals(list);
  const today = localDate(nowMs);
  const avgOf = (start: string) => {
    const mins = Array.from({ length: 7 }, (_, i) => shiftDay(start, i)).filter((d) => d <= today).map((d) => days.get(d) ?? 0).filter((m) => m > 0);
    return mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
  };
  return { avg: avgOf(weekStart), lastAvg: avgOf(shiftDay(weekStart, -7)) };
}
