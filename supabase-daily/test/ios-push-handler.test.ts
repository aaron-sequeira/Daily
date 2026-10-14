import { describe, expect, it, vi } from 'vitest';
import type { IosSchedule } from '../supabase/functions/ios-push/due.ts';
import { handle, type Deps, type Device, type Store } from '../supabase/functions/ios-push/handler.ts';

const DEVICE = '0b0e9c8e-6f3a-4b8e-9d1c-2f4a6b8c0d1e';
const START = 'aa'.repeat(32);
const ACTIVITY = 'bb'.repeat(32);
const schedule: IosSchedule = {
  tz: 'UTC', morning: '07:00', windDown: '23:00', writeTime: '21:00',
  progress: { phase: 'progress' }, report: { phase: 'report' },
  reminders: [{ id: 1, time: '13:00', days: [1, 2, 3, 4, 5, 6, 7], state: { phase: 'reminder' }, title: 'Lunch', body: 'Eat' }]
};
const utc = (h: number, m = 0) => Date.UTC(2026, 9, 6, h, m);

function memoryStore() {
  const devices = new Map<string, Device>();
  const claims = new Set<string>();
  const store: Store = {
    getDevice: async (id) => devices.get(id) ?? null,
    upsertDevice: async (d) => { devices.set(d.device_id, { ...d }); },
    deleteDevice: async (id, user) => { if (devices.get(id)?.user_id === user) devices.delete(id); },
    setTokens: async (id, secret, patch) => {
      const d = devices.get(id);
      if (!d || d.secret !== secret) return false;
      devices.set(id, { ...d, ...patch });
      return true;
    },
    clearToken: async (id, field) => { const d = devices.get(id); if (d) devices.set(id, { ...d, [field]: null }); },
    devicesWithSchedule: async () => [...devices.values()].filter((d) => d.schedule),
    claim: async (id, key) => { const k = `${id}|${key}`; if (claims.has(k)) return false; claims.add(k); return true; },
    unclaim: async (id, key) => { claims.delete(`${id}|${key}`); },
    prune: async () => {}
  };
  return { store, devices, claims };
}

function deps(over: Partial<Deps> = {}) {
  const mem = memoryStore();
  const send = vi.fn(async (_token: string, _payload: Record<string, unknown>) => 200);
  const d: Deps = {
    store: mem.store, apns: { send }, cronSecret: 'cron', now: () => utc(13, 1), newSecret: () => 'secret-1',
    userId: async (auth) => (auth === 'Bearer user-a' ? 'user-a' : auth === 'Bearer user-b' ? 'user-b' : null), ...over
  };
  return { d, send, ...mem };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://x.supabase.co/functions/v1/ios-push${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const sync = (body: Record<string, unknown>, user = 'user-a') => post('/sync', { deviceId: DEVICE, island: true, startToken: START, activityToken: null, schedule, ...body }, { authorization: `Bearer ${user}` });
const tick = (secret = 'cron') => post('/tick', {}, { 'x-cron-secret': secret });

describe('ios-push /sync', () => {
  it('needs a signed-in user', async () => {
    const { d } = deps();
    expect((await handle(sync({}, 'nobody'), d)).status).toBe(401);
  });

  it('stores the schedule and tokens and returns the device secret, kept across syncs', async () => {
    const { d, devices } = deps();
    const first = await (await handle(sync({}), d)).json();
    expect(first).toEqual({ ok: true, secret: 'secret-1' });
    expect(devices.get(DEVICE)).toMatchObject({ user_id: 'user-a', start_token: START, activity_token: null, schedule });
    const again = await (await handle(sync({ activityToken: ACTIVITY }), { ...d, newSecret: () => 'secret-2' })).json();
    expect(again.secret).toBe('secret-1');
    expect(devices.get(DEVICE)?.activity_token).toBe(ACTIVITY);
  });

  it('never hands another account’s device secret over', async () => {
    const { d } = deps();
    await handle(sync({}), d);
    const other = await (await handle(sync({}, 'user-b'), { ...d, newSecret: () => 'secret-b' })).json();
    expect(other.secret).toBe('secret-b');
  });

  it('turning the Island off deletes the device', async () => {
    const { d, devices } = deps();
    await handle(sync({}), d);
    expect((await handle(sync({ island: false }), d)).status).toBe(200);
    expect(devices.has(DEVICE)).toBe(false);
  });

  it('refuses a bad schedule, token or device id', async () => {
    const { d } = deps();
    expect((await handle(sync({ schedule: { ...schedule, morning: '7am' } }), d)).status).toBe(400);
    expect((await handle(sync({ startToken: 'not-hex' }), d)).status).toBe(400);
    expect((await handle(sync({ deviceId: 'x' }), d)).status).toBe(400);
    expect((await handle(sync({ schedule: { ...schedule, reminders: [{ ...schedule.reminders[0], days: [0] }] } }), d)).status).toBe(400);
  });
});

describe('ios-push /token', () => {
  it('updates tokens only with the device’s secret', async () => {
    const { d, devices } = deps();
    await handle(sync({}), d);
    expect((await handle(post('/token', { deviceId: DEVICE, secret: 'wrong', activityToken: ACTIVITY }), d)).status).toBe(404);
    expect((await handle(post('/token', { deviceId: DEVICE, secret: 'secret-1', activityToken: ACTIVITY }), d)).status).toBe(200);
    expect(devices.get(DEVICE)?.activity_token).toBe(ACTIVITY);
    expect((await handle(post('/token', { deviceId: DEVICE, secret: 'secret-1', activityToken: null }), d)).status).toBe(200);
    expect(devices.get(DEVICE)?.activity_token).toBeNull();
  });
});

describe('ios-push /tick', () => {
  it('needs the cron secret', async () => {
    const { d } = deps();
    expect((await handle(tick('nope'), d)).status).toBe(401);
  });

  it('starts the activity with the reminder when none runs, once', async () => {
    const { d, send } = deps();
    await handle(sync({}), d);
    expect(await (await handle(tick(), d)).json()).toEqual({ devices: 1, sent: 1 });
    expect(send).toHaveBeenCalledWith(START, expect.objectContaining({ aps: expect.objectContaining({ event: 'start', alert: { title: 'Lunch', body: 'Eat', sound: 'default' } }) }));
    await handle(tick(), { ...d, now: () => utc(13, 2) });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('updates a running activity through its own token', async () => {
    const { d, send } = deps();
    await handle(sync({ activityToken: ACTIVITY }), d);
    await handle(tick(), d);
    expect(send.mock.calls[0][0]).toBe(ACTIVITY);
    expect((send.mock.calls[0][1] as { aps: { event: string } }).aps.event).toBe('update');
  });

  it('drops a token APNs says is gone (410), and retries after other failures', async () => {
    const gone = deps();
    gone.send.mockResolvedValue(410);
    await handle(sync({ activityToken: ACTIVITY }), gone.d);
    await handle(tick(), gone.d);
    expect(gone.devices.get(DEVICE)?.activity_token).toBeNull();

    const flaky = deps();
    flaky.send.mockResolvedValueOnce(503).mockResolvedValue(200);
    await handle(sync({}), flaky.d);
    await handle(tick(), flaky.d);
    await handle(tick(), { ...flaky.d, now: () => utc(13, 2) });
    expect(flaky.send).toHaveBeenCalledTimes(2);
  });
});
