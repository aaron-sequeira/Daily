import { describe, expect, it, vi } from 'vitest';
import { getSetting, setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { listReminders, saveReminder, setEnabled, turnOffBuiltins } from '../reminders/store';
import { buildSchedule, syncPush, type PushDeps } from './push';
import { reminderState } from './state';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();

async function setup() {
  const db = await makeTestDb();
  turnOffBuiltins(db);
  setSetting(db, 'wind_down', '22:30');
  setSetting(db, 'write_time', '21:00');
  return db;
}

describe('buildSchedule', () => {
  it('sends the enabled clock reminders with the Island state each one shows, and the day’s times', async () => {
    const db = await setup();
    saveReminder(db, { name: 'Stretch', message: 'Up you get', animation: 'stretch', schedule: { type: 'time', time: '11:00', days: [1, 3] }, breakSec: 0 });
    saveReminder(db, { name: 'Every hour', message: 'Look away', animation: 'stretch', schedule: { type: 'interval', minutes: 60 }, breakSec: 0 });
    const off = (saveReminder(db, { name: 'Off', message: 'x', animation: 'meal', schedule: { type: 'time', time: '12:00', days: [1] }, breakSec: 0 }) as { id: number }).id;
    setEnabled(db, off, false);
    const s = buildSchedule(db, at(10), 'Asia/Kolkata', null);
    const stretch = listReminders(db).find((r) => r.name === 'Stretch')!;
    expect(s).toMatchObject({ tz: 'Asia/Kolkata', morning: '07:00', windDown: '22:30', writeTime: '21:00' });
    expect(s.reminders).toEqual([{ id: stretch.id, time: '11:00', days: [1, 3], state: reminderState(stretch), title: 'Stretch', body: 'Up you get' }]);
    expect(s.report).toMatchObject({ phase: 'report' });
    expect(s.progress).toMatchObject({ phase: 'progress', timerEndMs: null }); // a pushed countdown would be stale
  });
});

function fake(over: Partial<PushDeps> = {}) {
  const fetchFn = vi.fn(async (_url: string, init: RequestInit) => new Response(JSON.stringify(JSON.parse(String(init.body)).island ? { ok: true, secret: 's3cret' } : { ok: true }), { status: 200 }));
  const setConfig = vi.fn();
  const deps: PushDeps = {
    url: 'https://x.supabase.co', fetchFn: fetchFn as unknown as typeof fetch, accessToken: async () => 'jwt', newId: () => '0b0e9c8e-6f3a-4b8e-9d1c-2f4a6b8c0d1e', tz: 'UTC',
    api: { tokens: () => ({ start: 'aa'.repeat(32), activity: null }), setConfig }, ...over
  };
  return { deps, fetchFn, setConfig };
}

describe('syncPush', () => {
  it('uploads once, hands the device secret to native code, then skips while nothing changed', async () => {
    const db = await setup();
    const { deps, fetchFn, setConfig } = fake();
    await syncPush(db, deps, at(10));
    await syncPush(db, deps, at(10, 5));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://x.supabase.co/functions/v1/ios-push/sync');
    expect(init.headers.authorization).toBe('Bearer jwt');
    expect(JSON.parse(String(init.body))).toMatchObject({ deviceId: '0b0e9c8e-6f3a-4b8e-9d1c-2f4a6b8c0d1e', island: true, startToken: 'aa'.repeat(32), activityToken: null });
    expect(setConfig).toHaveBeenCalledWith('https://x.supabase.co/functions/v1/ios-push', '0b0e9c8e-6f3a-4b8e-9d1c-2f4a6b8c0d1e', 's3cret');
  });

  it('uploads again when the schedule changes, and twice a day anyway', async () => {
    const db = await setup();
    const { deps, fetchFn } = fake();
    await syncPush(db, deps, at(10));
    setSetting(db, 'write_time', '20:00');
    await syncPush(db, deps, at(10, 1));
    await syncPush(db, deps, at(22, 2));
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('switched off: tells the server once (it deletes the schedule), and never if it was never on', async () => {
    const db = await setup();
    setSetting(db, 'island', '0');
    const { deps, fetchFn } = fake();
    await syncPush(db, deps, at(9));
    expect(fetchFn).not.toHaveBeenCalled();
    setSetting(db, 'island', '1');
    await syncPush(db, deps, at(10));
    setSetting(db, 'island', '0');
    await syncPush(db, deps, at(10, 1));
    await syncPush(db, deps, at(10, 2));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchFn.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({ deviceId: '0b0e9c8e-6f3a-4b8e-9d1c-2f4a6b8c0d1e', island: false });
  });

  it('a failed upload is retried on the next sync; no session or no push token means nothing to send', async () => {
    const db = await setup();
    const down = fake({ fetchFn: vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch });
    await syncPush(db, down.deps, at(10));
    expect(getSetting(db, 'island_push_last')).toBe('');
    const noSession = fake({ accessToken: async () => null });
    await syncPush(db, noSession.deps, at(10));
    expect(noSession.fetchFn).not.toHaveBeenCalled();
    const noToken = fake({ api: { tokens: () => ({ start: null, activity: null }), setConfig: vi.fn() } });
    await syncPush(db, noToken.deps, at(10));
    expect(noToken.fetchFn).not.toHaveBeenCalled();
  });
});
