import type { Db } from '../db/db';
import { setSetting } from '../db/settings';
import type { Notifier } from '../reminders/notifier';
import type { Entitlement } from './billing';

const REMIND_BEFORE_MS = 2 * 86_400_000;

/** Caches the entitlement for isPlus() (offline-safe) and keeps the trial reminder honest: two days before a trial
 * that will renew, never for a paid plan or a cancelled trial. */
export async function saveEntitlement(db: Db, e: Entitlement, notifier: Notifier, nowMs: number): Promise<void> {
  setSetting(db, 'plus_until', e.active ? (e.untilMs ?? -1) : 0);
  setSetting(db, 'plus_plan', e.active ? (e.plan ?? '') : '');
  setSetting(db, 'plus_trial', e.active && e.trial ? '1' : '0');
  setSetting(db, 'plus_renews', e.active && e.willRenew ? '1' : '0');
  const at = e.active && e.trial && e.willRenew && e.untilMs !== null ? e.untilMs - REMIND_BEFORE_MS : null;
  if (at !== null && at > nowMs) await notifier.scheduleTrialReminder(at, 'Your free week ends in 2 days. Cancel in Google Play if Daily Plus isn’t for you.').catch(() => {});
  else await notifier.cancelTrialReminder().catch(() => {});
}
