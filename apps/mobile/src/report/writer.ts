import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { getSetting } from '../db/settings';
import type { Notifier } from '../reminders/notifier';
import { dayStartMs } from '../tracking/ingest';
import type { AiResult, ReportOut, WeekOut } from './ai';
import { shiftDay } from './days';
import { buildReportInput, type ReportInput } from './input';
import { plainReport } from './plain';
import { loadReport, loadWeekSentence, saveReport, saveWeekSentence, type AiError, type StoredReport } from './store';
import { buildWeek, weekInput, type WeekInput } from './week';

export type WriterDeps = {
  isPlus: boolean;
  notifier: Notifier;
  aiReport(input: ReportInput): Promise<AiResult<ReportOut>>;
  aiWeek(input: WeekInput): Promise<AiResult<WeekOut>>;
};

const dayOver = (day: string, nowMs: number) => nowMs >= dayStartMs(shiftDay(day, 1));
const hasData = (db: Db, day: string) => (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE day = ?', [day])?.n ?? 0) > 0;
const timeOn = (day: string, hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return dayStartMs(day) + (h * 60 + m) * 60_000; };

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

/** Builds and saves `day`'s report: the AI story for Plus, else (and on any AI failure) the plain one. */
export async function writeReport(db: Db, day: string, nowMs: number, deps: WriterDeps): Promise<StoredReport> {
  const input = buildReportInput(db, day, nowMs);
  const r = compose(day, nowMs, input, deps.isPlus ? await deps.aiReport(input) : null);
  saveReport(db, r);
  return r;
}

/** "Rewrite" / "Write it now" (Plus). A new story replaces the report; if the AI can't, the report the user has stays (spec §13). */
export async function rewriteReport(db: Db, day: string, nowMs: number, deps: WriterDeps): Promise<AiError | null> {
  const input = buildReportInput(db, day, nowMs);
  const ai = await deps.aiReport(input);
  if (ai.ok || !loadReport(db, day)) saveReport(db, compose(day, nowMs, input, ai));
  return ai.ok ? null : ai.error;
}

/** The write-time report over an earlier draft (a 3 pm "Write it now"). If the AI is asked and fails, the draft's story, tips
 * and ticks stay and only the numbers are refreshed; otherwise the new report replaces it, keeping ticks on tips that repeat. */
async function rewriteDraft(db: Db, day: string, nowMs: number, deps: WriterDeps, draft: StoredReport): Promise<StoredReport> {
  const input = buildReportInput(db, day, nowMs);
  const ai = deps.isPlus ? await deps.aiReport(input) : null;
  const fresh = compose(day, nowMs, input, ai);
  const r: StoredReport = ai && !ai.ok
    ? { ...draft, highlights: fresh.highlights, headline: draft.kind === 'plain' ? fresh.headline : draft.headline, createdMs: nowMs }
    : { ...fresh, plan: fresh.plan.map((p) => ({ ...p, done: draft.plan.some((d) => d.done && d.text === p.text) })) };
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
    await writeReport(db, yesterday, nowMs, deps);
    written.push(yesterday);
  }
  const writeAt = timeOn(today, getSetting(db, 'write_time'));
  const todays = loadReport(db, today);
  // A "Write it now" at 3 pm must not cost the 9 pm report: it counts as due until one is saved at or after the write time.
  if (nowMs >= writeAt && (!todays || todays.createdMs < writeAt) && hasData(db, today)) {
    const r = todays ? await rewriteDraft(db, today, nowMs, deps, todays) : await writeReport(db, today, nowMs, deps);
    written.push(today);
    if (await deps.notifier.canNotify().catch(() => false)) {
      await deps.notifier.showReportReady(today, r.headline).catch((e) => console.warn('daily: report notification failed', e));
    }
  }
  if (opts.retryFailed && deps.isPlus) {
    for (const day of [yesterday, today]) {
      const r = loadReport(db, day);
      if (r?.kind === 'plain' && r.aiError === 'failed' && !written.includes(day)) {
        await writeReport(db, day, nowMs, deps);
        written.push(day);
      }
    }
  }
  return written;
}

/** Plus: one AI sentence per finished week, kept for good. Anything else shows the computed sentence. */
export async function ensureWeekSentence(db: Db, weekStart: string, nowMs: number, deps: WriterDeps): Promise<string | null> {
  const cached = loadWeekSentence(db, weekStart);
  if (cached || !deps.isPlus) return cached;
  const view = buildWeek(db, weekStart, nowMs);
  const input = view.complete ? weekInput(view) : null;
  if (!input) return null;
  const ai = await deps.aiWeek(input);
  if (!ai.ok) return null;
  saveWeekSentence(db, weekStart, ai.json.sentence, nowMs);
  return ai.json.sentence;
}
