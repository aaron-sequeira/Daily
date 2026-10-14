import { screenTime } from '../../modules/daily-native/screenTime';
import type { Db } from '../db/db';
import { getNumber } from '../db/settings';
import { phoneMinToday, thresholds } from './milestones';
import { saveMilestones } from './store';
import { listReminders } from '../reminders/store';
import type { Reminder } from '@worksight/core/reminders';

/** Screen Time is on: permission given and something chosen to count. Always false on Android. */
export function screenTimeReady(): boolean {
  try { return !!screenTime && screenTime.authStatus() === 'approved' && screenTime.hasSelection(); } catch { return false; }
}

/** Today's iPhone phone time to the nearest milestone, or null without Screen Time. */
export function phoneMinNow(nowMs = Date.now()): number | null {
  if (!screenTime || !screenTimeReady()) return null;
  try { return phoneMinToday(screenTime.milestones(), nowMs); } catch { return null; }
}

/** (Re)starts milestone monitoring for the current goal; call after the goal or "What counts?" changes. */
export async function startScreenTime(db: Db): Promise<void> {
  if (!screenTime || !screenTimeReady()) return;
  await screenTime.startMonitoring(thresholds(getNumber(db, 'goal_min'))).catch((e) => console.warn('daily: screen time monitoring failed', e));
}

export type SetUpResult = 'ready' | 'denied' | 'no_selection' | 'unavailable';

/** Apple's permission prompt, then "What counts?", then monitoring. */
export async function setUpScreenTime(db: Db): Promise<SetUpResult> {
  if (!screenTime) return 'unavailable';
  try {
    const status = screenTime.authStatus() === 'approved' ? 'approved' : await screenTime.requestAuth();
    if (status !== 'approved') return 'denied';
    if (!(await screenTime.pickApps()) && !screenTime.hasSelection()) return 'no_selection';
    await startScreenTime(db);
    return 'ready';
  } catch (e) {
    console.warn('daily: screen time set-up failed', e);
    return 'unavailable';
  }
}

/** "What counts?" from Settings: re-pick, then restart monitoring. */
export async function changeWhatCounts(db: Db): Promise<void> {
  if (!screenTime) return;
  if (await screenTime.pickApps().catch(() => false)) await startScreenTime(db);
}

/** Copies new milestones from the App Group into the database (the day report, week and moods read them there). */
export function syncScreenTime(db: Db): void {
  if (!screenTime) return;
  try { saveMilestones(db, screenTime.milestones()); } catch (e) { console.warn('daily: screen time sync failed', e); }
  try { screenTime.setWater(waterJson(listReminders(db))); } catch (e) { console.warn('daily: water hand-off failed', e); }
}

/** The phone-time reminder the ActivityMonitor posts while Daily is closed (iPhone can't run it from the app). */
export function waterJson(reminders: Reminder[]): string {
  const w = reminders.find((r) => r.builtin === 'water' && r.enabled && r.schedule.type === 'interval');
  return w && w.schedule.type === 'interval' ? JSON.stringify({ reminderId: w.id, minutes: w.schedule.minutes, title: w.name, body: w.message }) : '';
}
