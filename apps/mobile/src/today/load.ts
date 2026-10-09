import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { getNumber } from '../db/settings';
import { loadState } from '../tracking/sync';
import { buildToday, type TodayInput, type TodayView } from './build';

export function loadToday(db: Db, nowMs: number): TodayView {
  const day = localDate(nowMs);
  const state = loadState(db);
  return buildToday({
    day,
    nowMs,
    goalMin: getNumber(db, 'goal_min'),
    totalsOnly: !!db.get('SELECT 1 AS x FROM totals_days WHERE day = ?', [day]),
    sessions: db.all<TodayInput['sessions'][number]>('SELECT package, start_ms, end_ms FROM sessions WHERE day = ?', [day]),
    open: state.openPkg !== null && state.openStartMs !== null ? { pkg: state.openPkg, startMs: state.openStartMs } : null,
    pickups: db.all<{ ts_ms: number }>('SELECT ts_ms FROM pickups WHERE day = ?', [day]).map((r) => r.ts_ms),
    apps: db.all<TodayInput['apps'][number]>('SELECT package, label, category, user_category, icon_png FROM apps WHERE package IN (SELECT DISTINCT package FROM sessions WHERE day = ?) OR package = ?',
      [day, state.openPkg ?? '']
    )
  });
}
