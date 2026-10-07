import { getDb } from '../db/expoDb';
import { isPlus } from '../plus/plus';
import { expoNotifier } from '../reminders/expoNotifier';
import { aiConfig, aiReport, aiWeek } from './ai';
import type { AiError } from './store';
import { rewriteReport, writeDueReports, type WriterDeps } from './writer';

export function liveDeps(): WriterDeps {
  const cfg = aiConfig();
  return { isPlus: isPlus(getDb()), notifier: expoNotifier, aiReport: (i, mode) => aiReport(cfg, i, mode), aiWeek: (i) => aiWeek(cfg, i), now: () => Date.now() };
}

let writing: Promise<unknown> | null = null;
const listeners = new Set<() => void>();

/** Called after each writer run that saved at least one day (the Report tab reloads). Returns the unsubscribe. */
export function onReportsWritten(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Takes the writer lock for `work`; the lock is released only by the run that holds it. */
function hold(work: Promise<unknown>): Promise<unknown> {
  const lock: Promise<unknown> = work.catch(() => {}).finally(() => { if (writing === lock) writing = null; });
  writing = lock;
  return lock;
}

/** One writer at a time: the minute task, the background task and app open can overlap. */
export function runReportWriter(opts: { retryFailed: boolean }): Promise<unknown> {
  return writing ?? hold(Promise.resolve()
    .then(() => writeDueReports(getDb(), Date.now(), liveDeps(), opts))
    .then((days) => { if (days.length) for (const l of listeners) l(); })
    .catch((e) => console.warn('daily: report writer failed', e)));
}

/** "Rewrite" / "Write it now" from the Report tab: waits for a writer in flight, then holds the lock itself, so a tap
 * near the write time can't race the scheduled write into a second notification. */
export function runRewrite(day: string): Promise<AiError | null> {
  const run = (writing ?? Promise.resolve()).then(() => rewriteReport(getDb(), day, Date.now(), liveDeps()));
  hold(run);
  return run;
}
