import { isCategory, type Category } from '../tracking/categories';
import { dayStartMs } from '../tracking/ingest';
import { moodFor, type Mood } from '../sunny/mood';
import { hourLabel } from '../format';

export type TodayInput = {
  day: string; nowMs: number; goalMin: number;
  sessions: { package: string; start_ms: number; end_ms: number }[];
  open: { pkg: string; startMs: number } | null;
  pickups: number[];
  apps: { package: string; label: string; category: string; user_category: string | null; icon_png: string | null }[];
  /** Filled from Android's daily totals (no event log): minutes per app, but not when. */
  totalsOnly?: boolean;
};
export type TodayApp = { pkg: string; label: string; minutes: number; icon: string | null };
export type TodayCategory = { id: Category; minutes: number; share: number; apps: TodayApp[] };
export type TodayView = {
  phoneMin: number; pickups: number; firstPickupMs: number | null;
  categories: TodayCategory[];
  timeline: { startH: number; segments: { left: number; width: number; category: Category }[]; nowAt: number | null; ticks: { at: number; label: string }[] };
  mood: Mood; goalMin: number; leftMin: number; empty: boolean; totalsOnly: boolean;
};

const MIN = 60_000;
const HOUR = 3_600_000;

export function buildToday(input: TodayInput): TodayView {
  const dayStart = dayStartMs(input.day);
  const dayEnd = dayStart + 24 * HOUR;
  const spans = input.sessions.map((s) => ({ pkg: s.package, start: s.start_ms, end: s.end_ms }));
  if (input.open) {
    const start = Math.max(input.open.startMs, dayStart);
    const end = Math.min(input.nowMs, dayEnd);
    if (end > start) spans.push({ pkg: input.open.pkg, start, end });
  }

  const meta = new Map(input.apps.map((a) => [a.package, a]));
  const categoryOf = (pkg: string): Category => {
    const a = meta.get(pkg);
    if (!a) return 'other';
    if (isCategory(a.user_category)) return a.user_category;
    return isCategory(a.category) ? a.category : 'other';
  };

  const perApp = new Map<string, number>();
  for (const s of spans) perApp.set(s.pkg, (perApp.get(s.pkg) ?? 0) + (s.end - s.start) / MIN);
  const phoneMin = [...perApp.values()].reduce((a, b) => a + b, 0);

  const groups = new Map<Category, TodayApp[]>();
  for (const [pkg, minutes] of perApp) {
    const id = categoryOf(pkg);
    const a = meta.get(pkg);
    groups.set(id, [...(groups.get(id) ?? []), { pkg, label: a?.label ?? pkg, minutes, icon: a?.icon_png ?? null }]);
  }
  const categories: TodayCategory[] = [...groups].map(([id, list]) => {
    const minutes = list.reduce((a, b) => a + b.minutes, 0);
    return { id, minutes, share: phoneMin > 0 ? minutes / phoneMin : 0, apps: list.sort((a, b) => b.minutes - a.minutes) };
  }).sort((a, b) => b.minutes - a.minutes);

  const firstHour = spans.length ? Math.floor((Math.min(...spans.map((s) => s.start)) - dayStart) / HOUR) : 7;
  const nowHour = input.nowMs >= dayStart && input.nowMs < dayEnd ? Math.floor((input.nowMs - dayStart) / HOUR) : 24;
  const startH = Math.min(7, firstHour, nowHour);
  const span = 24 - startH;
  const pct = (ms: number) => ((ms - dayStart) / HOUR - startH) / span * 100;
  const segments = input.totalsOnly ? [] : spans.map((s) => ({ left: pct(s.start), width: ((s.end - s.start) / HOUR / span) * 100, category: categoryOf(s.pkg) }));
  const ticks: { at: number; label: string }[] = [];
  for (let h = startH; h < 24; h += 4) ticks.push({ at: ((h - startH) / span) * 100, label: hourLabel(h) });
  const nowAt = input.nowMs >= dayStart && input.nowMs < dayEnd ? pct(input.nowMs) : null;

  const pickups = [...input.pickups].sort((a, b) => a - b);
  return {
    phoneMin,
    pickups: pickups.length,
    firstPickupMs: input.totalsOnly ? null : pickups[0] ?? null,
    categories,
    timeline: { startH, segments, nowAt, ticks },
    mood: moodFor(phoneMin, input.goalMin),
    goalMin: input.goalMin,
    leftMin: input.goalMin - phoneMin,
    empty: spans.length === 0,
    totalsOnly: !!input.totalsOnly
  };
}
