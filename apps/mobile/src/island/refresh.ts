import * as Crypto from 'expo-crypto';
import { island } from '../../modules/daily-native/island';
import { getDb } from '../db/expoDb';
import { ensureUserId, supabase } from '../plus/supabase';
import { phoneMinNow } from '../screentime/live';
import { syncIsland } from './drive';
import { syncPush } from './push';

/** Brings the Dynamic Island up to date, then the server's copy of the day plan (for pushes while Daily is closed).
 * A no-op on Android. Never throws. */
export async function refreshIsland(): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const phone = phoneMinNow(now);
  await syncIsland(db, island, now, phone).catch((e) => console.warn('daily: island sync failed', e));
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (!island.isEnabled() && island.pushTokens().start === null) return; // Android, or no Live Activities at all
  await syncPush(db, {
    url, fetchFn: fetch, api: { tokens: () => island.pushTokens(), setConfig: (u, id, s) => island.setPushConfig(u, id, s) },
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', newId: () => Crypto.randomUUID(),
    accessToken: async () => {
      if (!url || !(await ensureUserId())) return null;
      return (await supabase()?.auth.getSession())?.data.session?.access_token ?? null;
    }
  }, now, phone).catch((e) => console.warn('daily: island push sync failed', e));
}
