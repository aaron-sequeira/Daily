import { getDb } from '../db/expoDb';
import { expoNotifier } from './expoNotifier';
import { tickReminders } from './tick';

/** Re-plan alarms now (after an edit, a switch, Skip today or onboarding). */
export async function applyReminders(): Promise<void> {
  try { await tickReminders(getDb(), expoNotifier, Date.now()); } catch (e) { console.warn('daily: applying reminders failed', e); }
}
