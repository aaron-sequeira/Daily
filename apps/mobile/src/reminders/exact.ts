import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';

/** When the exact-alarm permission changes, forget the saved clock plan so the next tick re-schedules every alarm
 * with the new precision. Returns true when it did. */
export function noteExactAlarms(db: Db, allowed: boolean): boolean {
  const value = allowed ? '1' : '0';
  if (getSetting(db, 'exact_alarms') === value) return false;
  setSetting(db, 'exact_alarms', value);
  setSetting(db, 'clock_plan', '');
  return true;
}
