import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import type { Notifier } from '../reminders/notifier';
import { dayStartMs } from '../tracking/ingest';
import type { AiResult, ReportOut, WeekOut } from './ai';
import { shiftDay } from './days';
import { buildReportInput, type ReportInput } from './input';
import { plainReport } from './plain';
import { loadReport, loadWeekSentence, saveReport, saveWeekSentence, type AiError, type PlanItem, type StoredReport } from './store';
import { buildWeek, weekInput, type WeekInput } from './week';

export type WriterDeps = {
  isPlus: boolean;
  notifier: Notifier;
  aiReport(input: ReportInput): Promise<AiResult<ReportOut>>;
  aiWeek(input: WeekInput): Promise<AiResult<WeekOut>>;
  /** The clock at save time, after the AI answers. Without one, saves are stamped with the start time. */
  now?: () => number;
};

const dayOver = (day: string, nowMs: number) => nowMs >= dayStartMs(shiftDay(day, 1));
const hasData = (db: Db, day: string) => (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE day = ?', [day])?.n ?? 0) > 0;
const timeOn = (day: string, hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return dayStartMs(day) + (h * 60 + m) * 60_000; };
/** False once Delete everything has run (it clears `onboarded`): a write that was waiting on the AI must not bring rows back. */
const stillOnboarded = (db: Db) => getSetting(db, 'onboarded') === '1';
const savedAt = (deps: WriterDeps, nowMs: number) => deps.now?.() ?? nowMs;
/** Ticks on `cur` carry over to the same tip text in a new plan. */
const keepTicks = (plan: PlanItem[], cur: StoredReport | null): PlanItem[] =>
  plan.map((p) => ({ ...p, done: p.done || !!cur?.plan.some((c) => c.done && c.text === p.text) }));

/** The plain report, with the AI's headline, story and tips laid over it when there is an AI answer. */
function compose(day: string, nowMs: number, input: ReportInput, ai: AiResult<ReportOut> | null): StoredReport {
  const plain = plainReport(input);
  const base: StoredReport = {
    day, kind: 'plain', headline: plain.headline, story: null, highlights: plain.highlights,
    plan: plain.tomorrow.map((text) => ({ text, done: false })), aiError: null, final: dayOver(day, nowMs), createdMs: nowMs
  };
  if (!ai) return base;
  if (!ai.ok) return { ...base, aiError: ai.error };
  return { ...base, kind: 'ai', headline: ai.json.headline, story: ai.json.story, plan: ai.json.tomorrow.map((text) => ({ text, done: false })) };
}

/** Builds and saves `day`'s report: the AI story for Plus, else (and on any AI failure) the plain one. Null when Delete
 * everything ran while the AI was writing. Whatever was saved meanwhile is merged, not overwritten. */
export async function writeReport(db: Db, day: string, nowMs: number, deps: WriterDeps): Promise<StoredReport | null> {
  const input = buildReportInput(db, day, nowMs);
  const ai = deps.isPlus ? await deps.aiReport(input) : null;
  if (!stillOnboarded(db)) return null;
  const cur = loadReport(db, day);
  const fresh = { ...compose(day, nowMs, input, ai), createdMs: savedAt(deps, nowMs) };
  // The silent retry of a failed story: a plan the user has started ticking stays, only the story is laid over it.
  const r: StoredReport = cur?.kind === 'plain' && fresh.kind === 'ai' && cur.plan.some((p) => p.done)
    ? { ...cur, kind: 'ai', headline: fresh.headline, story: fresh.story, aiError: null, createdMs: fresh.createdMs }
    : { ...fresh, plan: keepTicks(fresh.plan, cur) };
  saveReport(db, r);
  return r;
}

/** "Rewrite" / "Write it now" (Plus). A new story replaces the report; if the AI can't, the report the user has stays (spec §13). */
export async function rewriteReport(db: Db, day: string, nowMs: number, deps: WriterDeps): Promise<AiError | null> {
  const input = buildReportInput(db, day, nowMs);
  const ai = await deps.aiReport(input);
  if (!stillOnboarded(db)) return ai.ok ? null : ai.error;
  const cur = loadReport(db, day);
  if (ai.ok || !cur) {
    const fresh = compose(day, nowMs, input, ai);
    saveReport(db, { ...fresh, plan: keepTicks(fresh.plan, cur), createdMs: savedAt(deps, nowMs) });
  }
  return ai.ok ? null : ai.error;
}

/** The write-time report over an earlier draft (a 3 pm "Write it now"). If the AI is asked and fails, the draft's story, tips
 * and ticks stay and only the numbers are refreshed; otherwise the new report replaces it, keeping ticks on tips that repeat.
 * The draft is re-read after the AI answers, so ticks made meanwhile count. */
async function rewriteDraft(db: Db, day: string, nowMs: number, deps: WriterDeps, draft: StoredReport): Promise<StoredReport | null> {
  const input = buildReportInput(db, day, nowMs);
  const ai = deps.isPlus ? await deps.aiReport(input) : null;
  if (!stillOnboarded(db)) return null;
  const cur = loadReport(db, day) ?? draft;
  const fresh = compose(day, nowMs, input, ai);
  const r: StoredReport = ai && !ai.ok
    ? { ...cur, highlights: fresh.highlights, headline: cur.kind === 'plain' ? fresh.headline : cur.headline, createdMs: savedAt(deps, nowMs) }
    : { ...fresh, plan: keepTicks(fresh.plan, cur), createdMs: savedAt(deps, nowMs) };
  saveReport(db, r);
  return r;
}

/** A report written in the evening misses what came after. Once the day is over, refresh its numbers: the highlights
 * always, the headline too when it was the plain one. The story and the plan (with its ticks) stay. */
export function finalizeReport(db: Db, day: string, nowMs: number): void {
  const r = loadReport(db, day);
  if (!r || r.final || !dayOver(day, nowMs)) return;
  const plain = plainReport(buildReportInput(db, day, nowMs));
  saveReport(db, { ...r, highlights: plain.highlights, headline: r.kind === 'plain' ? plain.headline : r.headline, final: true });
}

/** Runs after every sync (minute task, background task, app open). Each piece happens at most once:
 * - last night's report is brought up to date, or written quietly if the phone missed the write time;
 * - today's report once "Write it at" has passed, with "Your day is ready";
 * - on app open (`retryFailed`), a Plus story that failed (offline, timeout) gets another try, silently. */
export async function writeDueReports(db: Db, nowMs: number, deps: WriterDeps, opts: { retryFailed: boolean }): Promise<string[]> {
  if (getSetting(db, 'onboarded') !== '1') return [];
  const today = localDate(nowMs);
  const yesterday = shiftDay(today, -1);
  const written: string[] = [];

  finalizeReport(db, yesterday, nowMs);
  if (!loadReport(db, yesterday) && hasData(db, yesterday)) {
    if (!(await writeReport(db, yesterday, nowMs, deps))) return written;
    written.push(yesterday);
  }
  const writeAt = timeOn(today, getSetting(db, 'write_time'));
  const todays = loadReport(db, today);
  // A "Write it now" at 3 pm must not cost the 9 pm report: it counts as due until one is saved at or after the write time.
  if (nowMs >= writeAt && (!todays || todays.createdMs < writeAt) && hasData(db, today)) {
    const r = todays ? await rewriteDraft(db, today, nowMs, deps, todays) : await writeReport(db, today, nowMs, deps);
    if (!r) return written;
    written.push(today);
    if (await deps.notifier.canNotify().catch(() => false)) {
      await deps.notifier.showReportReady(today, r.headline).catch((e) => console.warn('daily: report notification failed', e));
    }
  }
  if (opts.retryFailed && deps.isPlus) {
    for (const day of [yesterday, today]) {
      const r = loadReport(db, day);
      if (r?.kind === 'plain' && r.aiError === 'failed' && !written.includes(day)) {
        if (!(await writeReport(db, day, nowMs, deps))) return written;
        written.push(day);
      }
    }
  }
  return written;
}

const weekCalls = new Map<string, Promise<string | null>>();

/** Plus: one AI sentence per finished week, kept for good. Anything else shows the computed sentence. Each call costs
 * money, so: one call in flight per week, at most one try per week a day, and none again after an `invalid`. */
export async function ensureWeekSentence(db: Db, weekStart: string, nowMs: number, deps: WriterDeps): Promise<string | null> {
  const cached = loadWeekSentence(db, weekStart);
  const complete = shiftDay(weekStart, 7) <= localDate(nowMs);
  if (cached || !deps.isPlus || !complete) return cached;
  let call = weekCalls.get(weekStart);
  if (!call) {
    call = askWeek(db, weekStart, nowMs, deps).finally(() => weekCalls.delete(weekStart));
    weekCalls.set(weekStart, call);
  }
  return call;
}

async function askWeek(db: Db, weekStart: string, nowMs: number, deps: WriterDeps): Promise<string | null> {
  const tried = getSetting(db, 'week_ai_try');
  const today = `${weekStart}|${localDate(nowMs)}`;
  if (tried === today || tried === `${weekStart}|never`) return null;
  const input = weekInput(buildWeek(db, weekStart, nowMs));
  if (!input) return null;
  setSetting(db, 'week_ai_try', today);
  const ai = await deps.aiWeek(input);
  if (!stillOnboarded(db)) return null;
  if (!ai.ok) {
    if (ai.error === 'invalid') setSetting(db, 'week_ai_try', `${weekStart}|never`);
    return null;
  }
  saveWeekSentence(db, weekStart, ai.json.sentence, savedAt(deps, nowMs));
  return ai.json.sentence;
}
