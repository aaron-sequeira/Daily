import type { Db } from '../db/db';
import { getSetting } from '../db/settings';

/** Daily Plus. ponytail: M4 reads the developer switch (Settings → Developer); M5 swaps in RevenueCat's cached entitlement. */
export function isPlus(db: Db): boolean {
  return getSetting(db, 'dev_plus') === '1';
}
