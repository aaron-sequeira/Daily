import { island } from '../../modules/daily-native/island';
import { getDb } from '../db/expoDb';
import { phoneMinNow } from '../screentime/live';
import { syncIsland } from './drive';

/** Brings the Dynamic Island up to date; a no-op on Android. Never throws. */
export function refreshIsland(): Promise<void> {
  return syncIsland(getDb(), island, Date.now(), phoneMinNow()).catch((e) => console.warn('daily: island sync failed', e));
}
