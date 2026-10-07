import { getDb } from '../db/expoDb';
import { isPlus } from '../plus/plus';
import { resyncPlus } from '../plus/start';
import { noteRewrite, noteRewriteLimit } from '../plus/status';
import { expoNotifier } from '../reminders/expoNotifier';
import { aiConfig, aiReport, aiWeek, type AiResult } from './ai';
import type { AiError } from './store';
import { rewriteReport, writeDueReports, type WriterDeps } from './writer';

/** The server says not_plus: the cached entitlement may be stale (a lapse, a refund, or a plan the phone missed), so
 * re-read it in the background. The answer is passed on unchanged. */
function resyncOnNotPlus<T>(r: AiResult<T>): AiResult<T> {
  if (!r.ok && r.error === 'not_plus') void resyncPlus();
  return r;
}

export function liveDeps(): WriterDeps {
  const cfg = aiConfig();
  return {
    isPlus: isPlus(getDb()), notifier: expoNotifier, now: () => Date.now(),
    aiReport: (i, mode) => aiReport(cfg, i, mode).then(resyncOnNotPlus),
    aiWeek: (i) => aiWeek(cfg, i).then(resyncOnNotPlus)
  };
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
  const run = (writing ?? Promise.resolve()).then(() => rewriteReport(getDb(), day, Date.now(), liveDeps())).then((err) => {
    if (err === null) noteRewrite(getDb(), Date.now());
    else if (err === 'limit') noteRewriteLimit(getDb(), Date.now());
    return err;
  });
  hold(run);
  return run;
}
