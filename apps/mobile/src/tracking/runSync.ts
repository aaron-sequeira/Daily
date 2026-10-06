import DailyNative from '../../modules/daily-native';
import { getDb } from '../db/expoDb';
import { expoNotifier } from '../reminders/expoNotifier';
import { tickReminders } from '../reminders/tick';
import { sync } from './sync';

let running: Promise<'ok' | 'no_access'> | null = null;

/** One sync at a time (foreground refresh and background task share it), then the reminder tick (even if the sync throws) — which runs even
 * without usage access so clock reminders still work in reminders-only mode. */
export function runSync(): Promise<'ok' | 'no_access'> {
  running ??= (async () => {
    try {
      return await sync(getDb(), DailyNative, Date.now());
    } finally {
      await tickReminders(getDb(), expoNotifier, Date.now()).catch((e) => console.warn('daily: reminder tick failed', e));
    }
  })().finally(() => { running = null; });
  return running;
}
