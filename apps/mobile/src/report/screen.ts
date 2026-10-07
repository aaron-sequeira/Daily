import type { Db } from '../db/db';
import { buildReportInput } from './input';
import { plainReport } from './plain';
import { loadReport, type AiError, type Highlight, type PlanItem } from './store';

export type ReportScreen = {
  day: string; saved: boolean; kind: 'ai' | 'plain'; headline: string; story: string | null;
  highlights: Highlight[]; plan: PlanItem[]; aiError: AiError | null; empty: boolean;
};

/** The saved report, or a live plain preview of a day that hasn't been written yet. */
export function reportScreen(db: Db, day: string, nowMs: number): ReportScreen {
  const saved = loadReport(db, day);
  if (saved) return { day, saved: true, kind: saved.kind, headline: saved.headline, story: saved.story, highlights: saved.highlights, plan: saved.plan, aiError: saved.aiError, empty: false };
  const input = buildReportInput(db, day, nowMs);
  const p = plainReport(input);
  return { day, saved: false, kind: 'plain', headline: p.headline, story: null, highlights: p.highlights, plan: p.tomorrow.map((text) => ({ text, done: false })), aiError: null, empty: input.phoneMin === 0 };
}

export function firstDataDay(db: Db): string | null {
  return db.get<{ d: string | null }>('SELECT MIN(d) AS d FROM (SELECT MIN(day) AS d FROM sessions UNION ALL SELECT MIN(day) FROM reports)')?.d ?? null;
}
