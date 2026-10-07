import type { Db } from '../db/db';
import { getNumber, getSetting } from '../db/settings';

/** A subscription that will renew stays on this long past plus_until: the renewal can reach the phone late (offline,
 * Play's own grace period). The server still decides every AI spend. */
export const RENEW_GRACE_MS = 3 * 86_400_000;

/** Daily Plus, from the entitlement cached by saveEntitlement (works offline until it ends; spec §11). The developer
 * switch still forces it on in debug builds. */
export function isPlus(db: Db, nowMs: number = Date.now()): boolean {
  if (getSetting(db, 'dev_plus') === '1') return true;
  const until = getNumber(db, 'plus_until');
  if (until === -1) return true;
  if (until <= 0) return false;
  return until + (getSetting(db, 'plus_renews') === '1' ? RENEW_GRACE_MS : 0) > nowMs;
}
