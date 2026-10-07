// What daily-ai accepts (spec §11): a report or a week, names and numbers only, never a free-form prompt.
// No imports, so the app's tests can import this file to prove that what the app sends passes unchanged.

export const MAX_BODY_BYTES = 32 * 1024;
const CATEGORIES = ['social', 'messages', 'fun', 'learning', 'work', 'other'] as const;
const MOODS = ['glowing', 'happy', 'alright', 'fading', 'sad'] as const;
type Category = typeof CATEGORIES[number];
type Mood = typeof MOODS[number];

export type ReportInput = {
  day: string; goalMin: number; phoneMin: number; pickups: number;
  apps: { name: string; category: Category; minutes: number; opens: number }[];
  categories: Partial<Record<Category, number>>;
  hourly: number[];
  longest: { app: string; category: Category; minutes: number; start: string } | null;
  quietest: { from: string; to: string; minutes: number } | null;
  late: { after: string; minutes: number };
  moods: { mood: Mood; at: string }[];
  water: number;
  last7: { day: string; phoneMin: number }[];
  yesterdayPlan: { text: string; done: boolean }[];
};
export type WeekInput = { weekStart: string; avgMin: number; lastAvgMin: number | null; days: { day: string; phoneMin: number }[]; topApps: { name: string; minutes: number }[] };
export type Mode = 'auto' | 'rewrite';
export type AiRequest = { kind: 'report'; mode: Mode; input: ReportInput } | { kind: 'week'; mode: Mode; input: WeekInput };
export type ReportOut = { headline: string; story: string; tomorrow: string[] };
export type WeekOut = { sentence: string };

const MAX_MIN = 7 * 24 * 60;

class Bad extends Error {}
const fail = (): never => { throw new Bad(); };
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail());
const int = (v: unknown, max = MAX_MIN): number => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : fail());
const str = (v: unknown, max: number): string => (typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v : fail());
const bool = (v: unknown): boolean => (typeof v === 'boolean' ? v : fail());
const dayKey = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fail());
const clock = (v: unknown): string => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fail());
const oneOf = <T extends string>(all: readonly T[], v: unknown): T => (all.includes(v as T) ? (v as T) : fail());
const arr = <T>(v: unknown, max: number, f: (x: unknown) => T): T[] => (Array.isArray(v) && v.length <= max ? v.map(f) : fail());

// Every object is rebuilt from the fields named here, so unknown keys never survive.
function reportInput(raw: unknown): ReportInput {
  const v = obj(raw);
  const categories: Partial<Record<Category, number>> = {};
  for (const [k, n] of Object.entries(obj(v.categories))) categories[oneOf(CATEGORIES, k)] = int(n);
  const hourly = arr(v.hourly, 24, (n) => int(n, 60));
  if (hourly.length !== 24) fail();
  const late = obj(v.late);
  return {
    day: dayKey(v.day), goalMin: int(v.goalMin), phoneMin: int(v.phoneMin), pickups: int(v.pickups, 5000),
    apps: arr(v.apps, 12, (x) => { const a = obj(x); return { name: str(a.name, 60), category: oneOf(CATEGORIES, a.category), minutes: int(a.minutes), opens: int(a.opens, 5000) }; }),
    categories,
    hourly,
    longest: v.longest === null ? null : ((l) => ({ app: str(l.app, 60), category: oneOf(CATEGORIES, l.category), minutes: int(l.minutes), start: clock(l.start) }))(obj(v.longest)),
    quietest: v.quietest === null ? null : ((q) => ({ from: clock(q.from), to: clock(q.to), minutes: int(q.minutes) }))(obj(v.quietest)),
    late: { after: clock(late.after), minutes: int(late.minutes) },
    moods: arr(v.moods, 12, (x) => { const m = obj(x); return { mood: oneOf(MOODS, m.mood), at: clock(m.at) }; }),
    water: int(v.water, 100),
    last7: arr(v.last7, 7, (x) => { const d = obj(x); return { day: dayKey(d.day), phoneMin: int(d.phoneMin) }; }),
    yesterdayPlan: arr(v.yesterdayPlan, 4, (x) => { const p = obj(x); return { text: str(p.text, 120), done: bool(p.done) }; })
  };
}

function weekInput(raw: unknown): WeekInput {
  const v = obj(raw);
  return {
    weekStart: dayKey(v.weekStart), avgMin: int(v.avgMin), lastAvgMin: v.lastAvgMin === null ? null : int(v.lastAvgMin),
    days: arr(v.days, 7, (x) => { const d = obj(x); return { day: dayKey(d.day), phoneMin: int(d.phoneMin) }; }),
    topApps: arr(v.topApps, 3, (x) => { const a = obj(x); return { name: str(a.name, 60), minutes: int(a.minutes) }; })
  };
}

export function parseRequest(raw: unknown): AiRequest | null {
  try {
    const v = obj(raw);
    const mode = oneOf(['auto', 'rewrite'] as const, v.mode);
    if (v.kind === 'report') return { kind: 'report', mode, input: reportInput(v.input) };
    if (v.kind === 'week') return { kind: 'week', mode, input: weekInput(v.input) };
    return null;
  } catch (e) {
    if (e instanceof Bad) return null;
    throw e;
  }
}
