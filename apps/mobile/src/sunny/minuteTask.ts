import { runSync } from '../tracking/runSync';

/** The "DailyMinute" headless task the Sunny service starts every 60 s. */
export async function minuteTask(): Promise<void> {
  try {
    await runSync();
  } catch (e) {
    console.warn('daily: minute task failed', e);
  }
}
