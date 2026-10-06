import { localDate } from '@worksight/core/date';
import type { DailyNativeApi } from '../../modules/daily-native';
import type { Db } from '../db/db';
import { getNumber } from '../db/settings';
import { moodFor } from '../sunny/mood';
import { categoryFor } from './categories';
import { dayStartMs, ingest, INITIAL_STATE, type IngestState } from './ingest';

export type SyncNative = Pick<DailyNativeApi, 'packageName' | 'defaultLauncher' | 'hasUsageAccess' | 'queryEvents' | 'appInfo'>;

const DAY_MS = 86_400_000;
const BACKFILL_MS = 7 * DAY_MS;

export function loadState(db: Db): IngestState {
  const r = db.get<{ last_event_ms: number; open_pkg: string | null; open_start_ms: number | null }>('SELECT * FROM ingest_state WHERE id = 1');
  return r ? { lastEventMs: r.last_event_ms, openPkg: r.open_pkg, openStartMs: r.open_start_ms } : INITIAL_STATE;
}

function saveState(db: Db, s: IngestState): void {
  db.run(
    `INSERT INTO ingest_state (id, last_event_ms, open_pkg, open_start_ms) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_event_ms = excluded.last_event_ms, open_pkg = excluded.open_pkg, open_start_ms = excluded.open_start_ms`,
    [s.lastEventMs, s.openPkg, s.openStartMs]
  );
}

/** Finished sessions of `day` plus the still-open app's time inside that day, up to now. */
export function phoneMsForDay(db: Db, day: string, nowMs: number): number {
  const done = db.get<{ ms: number | null }>('SELECT SUM(end_ms - start_ms) AS ms FROM sessions WHERE day = ?', [day])?.ms ?? 0;
  const s = loadState(db);
  if (s.openPkg === null || s.openStartMs === null) return done;
  const start = Math.max(s.openStartMs, dayStartMs(day));
  const end = Math.min(nowMs, dayStartMs(day) + DAY_MS);
  return done + Math.max(0, end - start);
}

function logMood(db: Db, nowMs: number): void {
  const day = localDate(nowMs);
  const mood = moodFor(phoneMsForDay(db, day, nowMs) / 60_000, getNumber(db, 'goal_min'));
  const last = db.get<{ mood: string }>('SELECT mood FROM mood_log WHERE day = ? ORDER BY ts_ms DESC LIMIT 1', [day])?.mood;
  if (last !== mood) db.run('INSERT INTO mood_log (day, ts_ms, mood) VALUES (?, ?, ?)', [day, nowMs, mood]);
}

function sweep(db: Db, nowMs: number): void {
  const cutoff = localDate(nowMs - getNumber(db, 'retention_days') * DAY_MS);
  for (const table of ['sessions', 'pickups', 'mood_log']) db.run(`DELETE FROM ${table} WHERE day < ?`, [cutoff]);
}

export async function sync(db: Db, native: SyncNative, nowMs: number): Promise<'ok' | 'no_access'> {
  if (!native.hasUsageAccess()) return 'no_access';
  const state = loadState(db);
  const events = await native.queryEvents(Math.max(state.lastEventMs, nowMs - BACKFILL_MS), nowMs);
  const ignore = new Set([native.packageName(), 'com.android.systemui', native.defaultLauncher() ?? '']);
  const res = ingest(events, state, ignore);

  const known = new Set(db.all<{ package: string }>('SELECT package FROM apps').map((r) => r.package));
  const seen = new Set(res.sessions.map((s) => s.pkg));
  if (res.state.openPkg) seen.add(res.state.openPkg);
  const fresh = [...seen].filter((p) => !known.has(p));
  const infos = fresh.length > 0 ? await native.appInfo(fresh) : [];

  db.tx(() => {
    for (const s of res.sessions) {
      db.run('INSERT OR IGNORE INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [s.pkg, s.startMs, s.endMs, s.day]);
    }
    for (const t of res.pickups) db.run('INSERT OR IGNORE INTO pickups (ts_ms, day) VALUES (?, ?)', [t, localDate(t)]);
    for (const a of infos) {
      db.run('INSERT OR IGNORE INTO apps (package, label, category, icon_png) VALUES (?, ?, ?, ?)', [a.pkg, a.label, categoryFor(a.pkg, a.category, null), a.icon]);
    }
    saveState(db, res.state);
    logMood(db, nowMs);
    sweep(db, nowMs);
  });
  return 'ok';
}
