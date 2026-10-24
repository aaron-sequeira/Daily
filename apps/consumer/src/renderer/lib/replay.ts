import type { Chapter } from '../../main/replay/chapters';
import type { ReplayShot } from '../../main/ipc';
import { hourLabel } from './format';

const H = 3_600_000;

export interface RibbonItem { id: string; leftPct: number; widthPct: number; label: string; category: string }

/** Each chapter's place on the day's ribbon, as percentages of [dayStart, dayEnd]. */
export function ribbon(chapters: Chapter[], dayStart: number, dayEnd: number): RibbonItem[] {
  const span = Math.max(1, dayEnd - dayStart);
  return chapters.map((c) => ({
    id: c.id, leftPct: ((c.start - dayStart) / span) * 100, widthPct: ((c.end - c.start) / span) * 100,
    label: c.apps[0]?.app ?? '', category: c.category
  }));
}

/** The ribbon's window: from the first chapter's hour to the end of the last chapter's hour. */
export function dayWindow(chapters: Chapter[]): [number, number] | null {
  if (!chapters.length) return null;
  const floorH = (ms: number): number => { const d = new Date(ms); d.setMinutes(0, 0, 0); return d.getTime(); };
  const last = chapters[chapters.length - 1].end;
  const end = floorH(last) === last ? last : floorH(last) + H;
  return [floorH(chapters[0].start), Math.max(end, floorH(chapters[0].start) + H)];
}

/** Labels under the ribbon, every other hour from its start. */
export function hourTicks(start: number, end: number): { pct: number; label: string }[] {
  const out: { pct: number; label: string }[] = [];
  for (let t = start; t < end; t += 2 * H) out.push({ pct: ((t - start) / (end - start)) * 100, label: hourLabel(new Date(t).getHours()) });
  return out;
}

/** Screenshots taken within the chapter (both ends included). */
export const shotsFor = (c: Chapter, shots: ReplayShot[]): ReplayShot[] => shots.filter((s) => s.at >= c.start && s.at <= c.end);

/** At most `n` items picked evenly across the list (first and last included), so a long chapter's later moments show too. */
export function spread<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  return Array.from({ length: n }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (n - 1))]);
}
