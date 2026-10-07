import DailyNative from '../../modules/daily-native';
import { coachTick } from '../coach/coach';
import { getDb } from '../db/expoDb';
import { runReportWriter } from '../report/run';
import { expoNotifier } from '../reminders/expoNotifier';
import { loadToday } from '../today/load';
import { runSync } from '../tracking/runSync';
import { chipContent } from './chip';

/** The "DailyMinute" headless task the Sunny service starts every 60 s: sync (+ reminders), coach, then the chip. */
export async function minuteTask(): Promise<void> {
  try {
    const result = await runSync().catch((e) => { console.warn('daily: sync failed', e); return 'ok' as const; });
    const db = getDb();
    const now = Date.now();
    await coachTick(db, expoNotifier, now).catch((e) => console.warn('daily: coach tick failed', e));
    const v = loadToday(db, now);
    const c = chipContent({ access: result !== 'no_access' && DailyNative.hasUsageAccess(), phoneMin: v.phoneMin, goalMin: v.goalMin, leftMin: v.leftMin, mood: v.mood });
    DailyNative.updateChip(c.title, c.short, c.text, c.mood);
    await runReportWriter({ retryFailed: false });
  } catch (e) {
    console.warn('daily: minute task failed', e);
  }
}
