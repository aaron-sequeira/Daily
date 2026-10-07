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
  for (const table of ['sessions', 'pickups', 'mood_log', 'water_log']) db.run(`DELETE FROM ${table} WHERE day < ?`, [cutoff]);
  db.run('DELETE FROM nudges WHERE ts_ms < ?', [nowMs - getNumber(db, 'retention_days') * DAY_MS]);
}

/** Phone time between fromMs and nowMs: finished sessions clipped to the window, plus the open app. */
export function phoneMsSince(db: Db, fromMs: number, nowMs: number): number {
  const done = db.get<{ ms: number | null }>(
    'SELECT SUM(MIN(end_ms, ?) - MAX(start_ms, ?)) AS ms FROM sessions WHERE end_ms > ? AND start_ms < ?',
    [nowMs, fromMs, fromMs, nowMs]
  )?.ms ?? 0;
  const s = loadState(db);
  if (s.openPkg === null || s.openStartMs === null) return done;
  return done + Math.max(0, nowMs - Math.max(s.openStartMs, fromMs));
}

export async function sync(db: Db, native: SyncNative, nowMs: number): Promise<'ok' | 'no_access'> {
  if (!native.hasUsageAccess()) return 'no_access';
  let state = loadState(db);
  // An app "open" since before the gap must not be closed by the first event after it.
  if (state.lastEventMs < nowMs - BACKFILL_MS) state = { ...state, openPkg: null, openStartMs: null };
  const events = await native.queryEvents(Math.max(state.lastEventMs, nowMs - BACKFILL_MS), nowMs);
  const ignore = new Set([native.packageName(), 'com.android.systemui', native.defaultLauncher() ?? '']);
  const res = ingest(events, state, ignore);

  const known = new Set(db.all<{ package: string }>('SELECT package FROM apps').map((r) => r.package));
  const seen = new Set(res.sessions.map((s) => s.pkg));
  if (res.state.openPkg) seen.add(res.state.openPkg);
  const fresh = [...seen].filter((p) => !known.has(p));
  // Apps stored before migration v3 have no android_category yet; appInfo returns -1 for unknown ones, so this settles.
  const nullCat = new Set(db.all<{ package: string }>('SELECT package FROM apps WHERE android_category IS NULL').map((r) => r.package));
  const backfill = [...seen].filter((p) => nullCat.has(p));
  let infos: Awaited<ReturnType<SyncNative['appInfo']>> = [];
  let backfilled: Awaited<ReturnType<SyncNative['appInfo']>> = [];
  if (fresh.length + backfill.length > 0) {
    try {
      const got = await native.appInfo([...fresh, ...backfill]);
      infos = got.filter((a) => fresh.includes(a.pkg));
      backfilled = got.filter((a) => backfill.includes(a.pkg));
    } catch (e) {
      // ponytail: these rows keep label = package forever (INSERT OR IGNORE); a later sync could refresh label/icon for rows whose label equals the package.
      console.warn('daily: appInfo failed', e);
      infos = fresh.map((pkg) => ({ pkg, label: pkg, category: -1, icon: null }));
    }
  }

  db.tx(() => {
    for (const s of res.sessions) {
      db.run('INSERT OR IGNORE INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [s.pkg, s.startMs, s.endMs, s.day]);
    }
    for (const t of res.pickups) db.run('INSERT OR IGNORE INTO pickups (ts_ms, day) VALUES (?, ?)', [t, localDate(t)]);
    for (const a of infos) {
      db.run('INSERT OR IGNORE INTO apps (package, label, category, icon_png, android_category) VALUES (?, ?, ?, ?, ?)', [a.pkg, a.label, categoryFor(a.pkg, a.category, null), a.icon, a.category]);
    }
    for (const a of backfilled) db.run('UPDATE apps SET android_category = ? WHERE package = ? AND android_category IS NULL', [a.category, a.pkg]);
    saveState(db, res.state);
    logMood(db, nowMs);
    sweep(db, nowMs);
  });
  return 'ok';
}
