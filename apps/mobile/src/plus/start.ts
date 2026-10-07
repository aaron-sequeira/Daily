import type { Db } from '../db/db';
import type { Notifier } from '../reminders/notifier';
import type { Billing } from './billing';
import { saveEntitlement } from './entitlement';

let listening = false;

/** Tests only: forget the listener registration so each test starts clean. */
export function resetPlusForTests(): void { listening = false; }

/** App launch: configure billing, log in with the (anonymous) user id, and keep the cached entitlement current. Never
 * throws; offline it keeps the last known entitlement and tries again on the next launch. */
export async function startPlus(db: Db, deps: { ensureUserId: () => Promise<string | null>; billing: Billing; notifier: Notifier }): Promise<void> {
  try {
    const userId = await deps.ensureUserId();
    await deps.billing.start();
    if (!listening) {
      listening = true;
      deps.billing.onChange((e) => { saveEntitlement(db, e, deps.notifier, Date.now()).catch(() => {}); });
    }
    try {
      if (userId) await deps.billing.logIn(userId);
      await saveEntitlement(db, await deps.billing.entitlement(), deps.notifier, Date.now());
    } catch (e) {
      console.warn('daily: Plus sync failed', e);
    }
  } catch (e) {
    console.warn('daily: Plus start failed', e);
  }
}
