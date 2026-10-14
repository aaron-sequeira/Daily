import { localDate } from '@worksight/core/date';
import type { IslandAction, IslandApi } from '../../modules/daily-native/island';
import type { Db } from '../db/db';
import { getNumber, getSetting, setSetting } from '../db/settings';
import { getStates, listReminders, markDone } from '../reminders/store';
import { loadReport } from '../report/store';
import { pickIsland, type BreakNow, type IslandInputs } from './state';

const RESHOW_MS = 6 * 3_600_000;

function parse<T>(raw: string, fallback: T): T {
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}

/** `phoneMin`: iPhone Screen Time today (milestones), or null without it. */
export function islandInputs(db: Db, nowMs: number, phoneMin: number | null = null): IslandInputs {
  const brk = parse<BreakNow | null>(getSetting(db, 'island_break'), null);
  const today = localDate(nowMs);
  return {
    reminders: listReminders(db), states: getStates(db), handled: parse(getSetting(db, 'island_handled'), {}),
    brk: brk && brk.startMs + brk.totalSec * 1000 > nowMs ? brk : null,
    report: loadReport(db, today), reportSeen: getSetting(db, 'island_report_seen') === today,
    phone: phoneMin === null ? null : { min: phoneMin, goalMin: getNumber(db, 'goal_min') }
  };
}

const handle = (db: Db, id: number, atMs: number) =>
  setSetting(db, 'island_handled', JSON.stringify({ ...parse<Record<number, number>>(getSetting(db, 'island_handled'), {}), [id]: atMs }));

/** A button pressed in the Island (queued by Swift in the App Group). Swift already showed progress and scheduled a snooze. */
export function applyIslandAction(db: Db, a: IslandAction): void {
  if (a.action === 'endBreak') { endIslandBreak(db); return; }
  if (a.reminderId === null) return;
  if (a.action === 'done') markDone(db, a.reminderId, a.atMs);
  handle(db, a.reminderId, a.atMs);
}

export const startIslandBreak = (db: Db, b: BreakNow) => setSetting(db, 'island_break', JSON.stringify(b));
export const endIslandBreak = (db: Db) => setSetting(db, 'island_break', '');
export const markIslandReportSeen = (db: Db, nowMs: number) => setSetting(db, 'island_report_seen', localDate(nowMs));

/** Applies queued Island actions, then shows the current state (only when it changed, or every 6 h), or ends it when off. */
export async function syncIsland(db: Db, api: Pick<IslandApi, 'isEnabled' | 'show' | 'end' | 'takeActions'>, nowMs: number, phoneMin: number | null = null): Promise<void> {
  for (const a of api.takeActions()) applyIslandAction(db, a);
  if (getSetting(db, 'island') !== '1' || !api.isEnabled()) {
    if (getSetting(db, 'island_last')) { await api.end(); setSetting(db, 'island_last', ''); }
    return;
  }
  const { state, fallback } = pickIsland(islandInputs(db, nowMs, phoneMin), nowMs);
  const json = JSON.stringify(state);
  if (json === getSetting(db, 'island_last') && nowMs - Number(getSetting(db, 'island_last_at')) < RESHOW_MS) return;
  await api.show(json, JSON.stringify(fallback));
  setSetting(db, 'island_last', json);
  setSetting(db, 'island_last_at', nowMs);
}
