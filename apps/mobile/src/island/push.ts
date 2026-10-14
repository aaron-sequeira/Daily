import type { IosSchedule } from '../../../../supabase-daily/supabase/functions/ios-push/due';
import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import { listReminders } from '../reminders/store';
import { islandInputs } from './drive';
import { pickIsland, reminderState, reportState } from './state';

/** The day plan the ios-push function needs to drive the Dynamic Island while Daily is closed (spec §3). The Island
 * states are worked out here, so the server only decides when to push them. */
export function buildSchedule(db: Db, nowMs: number, tz: string, phoneMin: number | null): IosSchedule {
  const { fallback } = pickIsland(islandInputs(db, nowMs, phoneMin), nowMs);
  return {
    tz, morning: '07:00', windDown: getSetting(db, 'wind_down'), writeTime: getSetting(db, 'write_time'),
    // a countdown sent now would be stale by the time it is pushed
    progress: { ...fallback, timerEndMs: null, compact: '' },
    report: reportState(null),
    reminders: listReminders(db)
      .filter((r) => r.enabled && r.schedule.type === 'time')
      .map((r) => r.schedule.type === 'time' ? { id: r.id, time: r.schedule.time, days: r.schedule.days, state: reminderState(r), title: r.name, body: r.message } : null)
      .filter((r): r is NonNullable<typeof r> => r !== null)
  };
}

export type PushApi = {
  /** Live Activity push tokens (hex) iOS gave the app: push-to-start, and the running activity's update token. */
  tokens(): { start: string | null; activity: string | null };
  /** Lets native code post new tokens itself (iOS hands them over even while the app's JavaScript isn't running). */
  setConfig(functionUrl: string, deviceId: string, secret: string): void;
};

export type PushDeps = {
  url: string; fetchFn: typeof fetch; api: PushApi; tz: string;
  accessToken(): Promise<string | null>; newId(): string;
};

const RESEND_MS = 12 * 3_600_000;

/** Uploads the schedule and tokens when they change (and twice a day anyway), or tells the server once that the Island
 * is off. Failures are retried on the next sync. */
export async function syncPush(db: Db, d: PushDeps, nowMs: number, phoneMin: number | null = null): Promise<void> {
  let deviceId = getSetting(db, 'island_device_id');
  if (!deviceId) { deviceId = d.newId(); setSetting(db, 'island_device_id', deviceId); }
  const on = getSetting(db, 'island') === '1';
  const last = getSetting(db, 'island_push_last');
  let body: Record<string, unknown>;
  if (on) {
    const t = d.api.tokens();
    if (!t.start && !t.activity) return; // iOS hasn't issued a token yet (or pushes aren't available)
    body = { deviceId, island: true, startToken: t.start, activityToken: t.activity, schedule: buildSchedule(db, nowMs, d.tz, phoneMin) };
  } else {
    if (!last) return; // never on (or already turned off on the server)
    body = { deviceId, island: false };
  }
  const key = JSON.stringify(body);
  if (on && key === last && nowMs - Number(getSetting(db, 'island_push_at')) < RESEND_MS) return;
  const jwt = await d.accessToken();
  if (!jwt) return;
  const fnUrl = `${d.url}/functions/v1/ios-push`;
  const res = await d.fetchFn(`${fnUrl}/sync`, { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: key });
  if (!res.ok) return;
  if (on) {
    const { secret } = (await res.json()) as { secret?: string };
    if (secret) d.api.setConfig(fnUrl, deviceId, secret);
  }
  setSetting(db, 'island_push_last', on ? key : '');
  setSetting(db, 'island_push_at', nowMs);
}
