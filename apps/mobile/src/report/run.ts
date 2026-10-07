import { getDb } from '../db/expoDb';
import { isPlus } from '../plus/plus';
import { expoNotifier } from '../reminders/expoNotifier';
import { aiConfig, aiReport, aiWeek } from './ai';
import { writeDueReports, type WriterDeps } from './writer';

export function liveDeps(): WriterDeps {
  const cfg = aiConfig();
  return { isPlus: isPlus(getDb()), notifier: expoNotifier, aiReport: (i) => aiReport(cfg, i), aiWeek: (i) => aiWeek(cfg, i) };
}

let writing: Promise<unknown> | null = null;

/** One writer at a time: the minute task, the background task and app open can overlap. */
export function runReportWriter(opts: { retryFailed: boolean }): Promise<unknown> {
  writing ??= writeDueReports(getDb(), Date.now(), liveDeps(), opts)
    .catch((e) => console.warn('daily: report writer failed', e))
    .finally(() => { writing = null; });
  return writing;
}
