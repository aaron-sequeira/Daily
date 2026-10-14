import { localDate } from '@worksight/core/date';
import type { DailyNativeApi } from '../../modules/daily-native';
import type { Db } from '../db/db';
import { getNumber } from '../db/settings';
import { moodFor } from '../sunny/mood';
import { categoryFor } from './categories';
import { dayStartMs, ingest, INITIAL_STATE, type IngestState } from './ingest';

export type SyncNative = Pick<DailyNativeApi, 'packageName' | 'defaultLauncher' | 'hasUsageAccess' | 'queryEvents' | 'appInfo' | 'usageTotals' | 'unlockCount'>;

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
  for (const table of ['sessions', 'pickups', 'mood_log', 'water_log', 'reports', 'st_milestones']) db.run(`DELETE FROM ${table} WHERE day < ?`, [cutoff]);
  db.run('DELETE FROM nudges WHERE ts_ms < ?', [nowMs - getNumber(db, 'retention_days') * DAY_MS]);
  db.run('DELETE FROM weeks WHERE week_start < ?', [cutoff]);
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

  const filled = res.sessions.length || res.state.openPkg ? [] : await totalsForLogFreePhones(db, native, ignore, nowMs);

  const known = new Set(db.all<{ package: string }>('SELECT package FROM apps').map((r) => r.package));
  const seen = new Set([...res.sessions.map((s) => s.pkg), ...filled.flatMap((d) => d.apps.map((a) => a.pkg))]);
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
    for (const d of filled) {
      // Synthetic: one session per app starting at midnight, one pickup row per unlock. Replaced on every sync.
      db.run('DELETE FROM sessions WHERE day = ?', [d.day]);
      db.run('DELETE FROM pickups WHERE day = ?', [d.day]);
      for (const a of d.apps) db.run('INSERT INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [a.pkg, d.start, d.start + a.ms, d.day]);
      for (let i = 0; i < d.unlocks; i++) db.run('INSERT OR IGNORE INTO pickups (ts_ms, day) VALUES (?, ?)', [d.start + i, d.day]);
      db.run('INSERT OR IGNORE INTO totals_days (day) VALUES (?)', [d.day]);
    }
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

type FilledDay = { day: string; start: number; apps: { pkg: string; ms: number }[]; unlocks: number };

/** Some phones (Realme/Oppo ColorOS) keep Android's per-app daily totals but no event log, so sessions never appear.
 * Detected as: apps used today per the totals, yet not one "app opened" event in the last 24 hours. Then the backfill
 * days without real sessions are filled from the totals (no timeline possible). */
async function totalsForLogFreePhones(db: Db, native: SyncNative, ignore: Set<string>, nowMs: number): Promise<FilledDay[]> {
  const usable = (list: { pkg: string; ms: number }[], cap: number) => list.filter((a) => a.ms > 0 && !ignore.has(a.pkg)).map((a) => ({ pkg: a.pkg, ms: Math.min(a.ms, cap) }));
  if (usable(await native.usageTotals(nowMs - DAY_MS, nowMs), DAY_MS).length === 0) return []; // no app use at all lately
  if ((await native.queryEvents(nowMs - DAY_MS, nowMs)).some((e) => e.type === 'resumed')) return []; // the log works
  const out: FilledDay[] = [];
  for (let i = 0; i < BACKFILL_MS / DAY_MS; i++) {
    const day = localDate(nowMs - i * DAY_MS);
    const start = dayStartMs(day);
    const end = Math.min(start + DAY_MS, nowMs);
    const real = db.get('SELECT 1 AS x FROM sessions WHERE day = ?', [day]) && !db.get('SELECT 1 AS x FROM totals_days WHERE day = ?', [day]);
    if (real) continue;
    const apps = usable(await native.usageTotals(start, end), end - start);
    if (apps.length) out.push({ day, start, apps, unlocks: Math.max(0, await native.unlockCount(start, end)) });
  }
  return out;
}
