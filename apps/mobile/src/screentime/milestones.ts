import { localDate } from '@worksight/core/date';

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

