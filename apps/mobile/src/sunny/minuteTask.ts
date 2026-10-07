import { localDate } from '@worksight/core/date';
import { AppState } from 'react-native';
import DailyNative from '../../modules/daily-native';
import { COACH_SNOOZE_MS } from '../coach/actions';
import { coachTick } from '../coach/coach';
import { getDb } from '../db/expoDb';
import { getSetting, setSetting } from '../db/settings';
import { isPlus } from '../plus/plus';
import { runReportWriter } from '../report/run';
import { expoNotifier } from '../reminders/expoNotifier';
import { loadToday } from '../today/load';
import { runSync } from '../tracking/runSync';
import { loadState } from '../tracking/sync';
import { bubbleShows } from './bubble';
import { chipContent } from './chip';

/** The "DailyMinute" headless task the Sunny service starts every 60 s: sync (+ reminders), coach, then the chip. */
export async function minuteTask(): Promise<void> {
  try {
    const result = await runSync().catch((e) => { console.warn('daily: sync failed', e); return 'ok' as const; });
    const db = getDb();
    const now = Date.now();
    let inCall = false;
    try { inCall = DailyNative.isInCall(); } catch (e) { console.warn('daily: call check failed', e); }
    try {
      for (const a of DailyNative.takeBubbleActions()) if (a === 'snooze') setSetting(db, 'coach_snooze_until', now + COACH_SNOOZE_MS);
    } catch (e) { console.warn('daily: bubble actions failed', e); }
    let shows = false;
    try {
      const pkg = loadState(db).openPkg;
      const cat = pkg === null ? null : db.get<{ android_category: number | null }>('SELECT android_category FROM apps WHERE package = ?', [pkg])?.android_category ?? null;
      shows = bubbleShows({
        plus: isPlus(db, now), on: getSetting(db, 'bubble') === '1', serviceOn: getSetting(db, 'sunny_service') === '1',
        canDraw: DailyNative.canDrawOverlays(), hiddenDay: DailyNative.bubbleHiddenDay(), today: localDate(now),
        appActive: AppState.currentState === 'active', openAndroidCategory: cat
      });
    } catch (e) { console.warn('daily: bubble check failed', e); }
    const v = loadToday(db, now);
    // the bubble must be up before it can speak, so update it first; it is only a no-op when nothing changed
    try { DailyNative.updateBubble(shows, v.mood); } catch (e) { console.warn('daily: bubble update failed', e); }
    const speak = shows ? (t: string, b: string) => DailyNative.showBubbleSpeech(t, b) : undefined;
    await coachTick(db, expoNotifier, now, inCall, speak).catch((e) => console.warn('daily: coach tick failed', e));
    const c = chipContent({ access: result !== 'no_access' && DailyNative.hasUsageAccess(), phoneMin: v.phoneMin, goalMin: v.goalMin, leftMin: v.leftMin, mood: v.mood });
    DailyNative.updateChip(c.title, c.short, c.text, c.mood);
    await runReportWriter({ retryFailed: false });
  } catch (e) {
    console.warn('daily: minute task failed', e);
  }
}
