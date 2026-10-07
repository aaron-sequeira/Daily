import type { Db } from '../db/db';
import type { Notifier } from '../reminders/notifier';
import type { Billing } from './billing';
import { saveEntitlement } from './entitlement';

type PlusDeps = { ensureUserId: () => Promise<string | null>; billing: Billing; notifier: Notifier };

let listening = false;
/** Set by startPlus once billing is configured; resyncPlus does nothing before that (an unconfigured store reports no
 * entitlement, which would wipe a paying user's cached Plus). */
let app: (PlusDeps & { db: Db }) | null = null;
let resyncing: Promise<void> | null = null;

/** Tests only: forget the listener registration and the app wiring so each test starts clean. */
export function resetPlusForTests(): void { listening = false; app = null; resyncing = null; }

/** Logs billing in as the signed-in Supabase user, so a purchase or restore lands on the user the server's token names.
 * Run before every store call. No user (offline, no config) or a failed logIn leaves billing as it is. */
export async function linkUser(deps: Pick<PlusDeps, 'billing' | 'ensureUserId'>): Promise<void> {
  const id = await deps.ensureUserId();
  if (id) await deps.billing.logIn(id).catch(() => {});
}

/** Re-reads the entitlement from billing and caches it: on resume, after Delete everything and when the server says
 * not_plus. One run at a time; never throws (offline it keeps the last known entitlement). */
export function resyncPlus(): Promise<void> {
  const a = app;
  if (!a) return Promise.resolve();
  return (resyncing ??= (async () => {
    try {
      await linkUser(a);
      await saveEntitlement(a.db, await a.billing.entitlement(), a.notifier, Date.now());
    } catch (e) {
      console.warn('daily: Plus sync failed', e);
    }
  })().finally(() => { resyncing = null; }));
}

/** App launch: configure billing first (synchronous, so a slow or stalled sign-in can't leave it unconfigured), then log
 * in with the (anonymous) user id and keep the cached entitlement current. Never throws; offline it keeps the last known
 * entitlement and tries again on the next launch or resume. */
export async function startPlus(db: Db, deps: PlusDeps): Promise<void> {
  try {
    await deps.billing.start();
    if (!listening) {
      listening = true;
      deps.billing.onChange((e) => { saveEntitlement(db, e, deps.notifier, Date.now()).catch(() => {}); });
    }
    app = { ...deps, db };
    await resyncPlus();
  } catch (e) {
    console.warn('daily: Plus start failed', e);
  }
}
