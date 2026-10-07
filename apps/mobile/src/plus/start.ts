import type { Db } from '../db/db';
import type { Notifier } from '../reminders/notifier';
import type { Billing } from './billing';
import { saveEntitlement } from './entitlement';

let unsubscribe: (() => void) | null = null;

/** App launch: sign in (anonymously), point RevenueCat at that user, and keep the cached entitlement current. Never
 * throws; offline it keeps the last known entitlement and tries again on the next launch. */
export async function startPlus(db: Db, deps: { ensureUserId: () => Promise<string | null>; billing: Billing; notifier: Notifier }): Promise<void> {
  try {
    const userId = await deps.ensureUserId();
    await deps.billing.start(userId);
    if (userId) await deps.billing.logIn(userId);
    unsubscribe ??= deps.billing.onChange((e) => { saveEntitlement(db, e, deps.notifier, Date.now()).catch(() => {}); });
    await saveEntitlement(db, await deps.billing.entitlement(), deps.notifier, Date.now());
  } catch (e) {
    console.warn('daily: Plus start failed', e);
  }
}
