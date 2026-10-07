import type { Db } from '../db/db';

export type Highlight = { kind: 'quiet' | 'opened' | 'longest' | 'late'; label: string; value: string };
export type AiError = 'not_plus' | 'limit' | 'invalid' | 'failed';
export type PlanItem = { text: string; done: boolean };
/** One day's saved report. `final` = written (or brought up to date) after the day ended. */
export type StoredReport = {
  day: string; kind: 'ai' | 'plain'; headline: string; story: string | null;
  highlights: Highlight[]; plan: PlanItem[]; aiError: AiError | null; final: boolean; createdMs: number;
};

export function saveReport(db: Db, r: StoredReport): void {
  const { day, kind, createdMs, ...rest } = r;
  db.run(
    'INSERT INTO reports (day, kind, json, created_ms) VALUES (?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET kind = excluded.kind, json = excluded.json, created_ms = excluded.created_ms',
    [day, kind, JSON.stringify(rest), createdMs]
  );
}

export function loadReport(db: Db, day: string): StoredReport | null {
  const row = db.get<{ kind: 'ai' | 'plain'; json: string; created_ms: number }>('SELECT kind, json, created_ms FROM reports WHERE day = ?', [day]);
  if (!row) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.json);
  } catch {
    return null; // a damaged row reads as "not written"; the writer replaces it
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const r: StoredReport = { story: null, highlights: [], plan: [], aiError: null, final: false, ...(parsed as Partial<StoredReport>), day, kind: row.kind, createdMs: row.created_ms } as StoredReport;
  if (!Array.isArray(r.plan)) r.plan = [];
  if (!Array.isArray(r.highlights)) r.highlights = [];
  return r;
}

/** Ticks the tip by its text, so a report rewritten under the screen never gets the wrong tip ticked. */
export function setPlanDone(db: Db, day: string, text: string, done: boolean): void {
  const r = loadReport(db, day);
  if (!r || !r.plan.some((p) => p.text === text)) return;
  saveReport(db, { ...r, plan: r.plan.map((p) => (p.text === text ? { ...p, done } : p)) });
}

export function loadWeekSentence(db: Db, weekStart: string): string | null {
  return db.get<{ sentence: string }>('SELECT sentence FROM weeks WHERE week_start = ?', [weekStart])?.sentence ?? null;
}

export function saveWeekSentence(db: Db, weekStart: string, sentence: string, nowMs: number): void {
  db.run('INSERT OR REPLACE INTO weeks (week_start, sentence, created_ms) VALUES (?, ?, ?)', [weekStart, sentence, nowMs]);
}
