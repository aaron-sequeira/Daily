import type { Db } from '../db/db';
import { getNumber, getSetting } from '../db/settings';

/** Daily Plus, from the entitlement cached by saveEntitlement (works offline until it ends; spec §11). The developer
 * switch still forces it on in debug builds. */
export function isPlus(db: Db, nowMs: number = Date.now()): boolean {
  if (getSetting(db, 'dev_plus') === '1') return true;
  const until = getNumber(db, 'plus_until');
  return until === -1 || until > nowMs;
}
