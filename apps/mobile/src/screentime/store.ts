import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { getNumber } from '../db/settings';
import { moodFor } from '../sunny/mood';
import type { Milestone } from './milestones';

/** Copies the ActivityMonitor's milestones (App Group) into Daily's database, where the day report and week read them.
 * Each new milestone also logs Sunny's mood at that moment, as Android's sync does every minute. */
export function saveMilestones(db: Db, list: Milestone[]): void {
  const goal = getNumber(db, 'goal_min');
  const fresh = list
    .filter((m) => Number.isFinite(m.min) && Number.isFinite(m.atMs) && m.min > 0)
    .filter((m) => !db.get('SELECT 1 AS x FROM st_milestones WHERE at_ms = ?', [Math.round(m.atMs)]))
    .sort((a, b) => a.atMs - b.atMs);
  db.tx(() => {
    for (const m of fresh) {
      const atMs = Math.round(m.atMs);
      const day = localDate(atMs);
      db.run('INSERT OR IGNORE INTO st_milestones (at_ms, min, day) VALUES (?, ?, ?)', [atMs, Math.round(m.min), day]);
      const mood = moodFor(stDayMin(db, day), goal);
      const last = db.get<{ mood: string }>('SELECT mood FROM mood_log WHERE day = ? ORDER BY ts_ms DESC LIMIT 1', [day])?.mood;
      if (last !== mood) db.run('INSERT INTO mood_log (day, ts_ms, mood) VALUES (?, ?, ?)', [day, atMs, mood]);
    }
  });
}

/** A day's iPhone phone time: its highest milestone (0 without one). */
export function stDayMin(db: Db, day: string): number {
  return db.get<{ m: number | null }>('SELECT MAX(min) AS m FROM st_milestones WHERE day = ?', [day])?.m ?? 0;
}
