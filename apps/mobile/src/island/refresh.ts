import { island } from '../../modules/daily-native/island';
import { getDb } from '../db/expoDb';
import { syncIsland } from './drive';

/** Brings the Dynamic Island up to date; a no-op on Android. Never throws. */
export function refreshIsland(): Promise<void> {
  return syncIsland(getDb(), island, Date.now()).catch((e) => console.warn('daily: island sync failed', e));
}
