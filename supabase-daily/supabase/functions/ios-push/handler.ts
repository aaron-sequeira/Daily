import { livePayload, type Apns } from './apns.ts';
import { dueEvents, type IosSchedule } from './due.ts';

/** One iPhone with "Sunny in the Dynamic Island" on. `secret` lets the app's native code post new push tokens while
 * the app's JavaScript (and with it the user's session) isn't running. */
export type Device = {
  device_id: string; user_id: string; secret: string;
  start_token: string | null; activity_token: string | null; schedule: IosSchedule | null;
};

export type Store = {
  getDevice(deviceId: string): Promise<Device | null>;
  upsertDevice(d: Device): Promise<void>;
  deleteDevice(deviceId: string, userId: string): Promise<void>;
  /** Only for the device's own secret; false when it doesn't match. */
  setTokens(deviceId: string, secret: string, patch: { start_token?: string | null; activity_token?: string | null }): Promise<boolean>;
  clearToken(deviceId: string, field: 'start_token' | 'activity_token'): Promise<void>;
  devicesWithSchedule(): Promise<Device[]>;
  /** Records that `key` is being sent; false if it already was (a push is never sent twice). */
  claim(deviceId: string, key: string, atMs: number): Promise<boolean>;
  unclaim(deviceId: string, key: string): Promise<void>;
  prune(beforeMs: number): Promise<void>;
};

export type Deps = {
  store: Store; apns: Apns | null; cronSecret: string;
  userId(authorization: string): Promise<string | null>;
  newSecret(): string; now(): number;
};

const MAX_BODY = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{16,512}$/i;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const token = (v: unknown): string | null | undefined => (v === null ? null : typeof v === 'string' && TOKEN.test(v) ? v.toLowerCase() : undefined);
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The schedule the phone sent, checked field by field; null if anything is off. */
export function parseSchedule(v: unknown): IosSchedule | null {
  if (!obj(v)) return null;
  const { tz, morning, windDown, writeTime, progress, report, reminders } = v;
  if (typeof tz !== 'string' || tz.length > 64 || ![morning, windDown, writeTime].every((t) => typeof t === 'string' && HHMM.test(t))) return null;
  if (!obj(progress) || !obj(report) || !Array.isArray(reminders) || reminders.length > 30) return null;
  const rs: IosSchedule['reminders'] = [];
  for (const r of reminders) {
    if (!obj(r) || !Number.isInteger(r.id) || typeof r.time !== 'string' || !HHMM.test(r.time) || !obj(r.state)) return null;
    if (!Array.isArray(r.days) || !r.days.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7)) return null;
    if (typeof r.title !== 'string' || typeof r.body !== 'string' || r.title.length > 120 || r.body.length > 300) return null;
    rs.push({ id: r.id as number, time: r.time, days: r.days as number[], state: r.state, title: r.title, body: r.body });
  }
  return { tz, morning: morning as string, windDown: windDown as string, writeTime: writeTime as string, progress, report, reminders: rs };
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return null;
  try { const v = JSON.parse(raw); return obj(v) ? v : null; } catch { return null; }
}

/** The phone (signed-in or anonymous user): turns the Island pushes on with its schedule and tokens, or off. */
async function sync(req: Request, d: Deps): Promise<Response> {
  const user = await d.userId(req.headers.get('authorization') ?? '');
  if (!user) return json(401, { error: 'unauthorized' });
  const body = await readJson(req);
  if (!body || typeof body.deviceId !== 'string' || !UUID.test(body.deviceId)) return json(400, { error: 'invalid' });
  const deviceId = body.deviceId.toLowerCase();
  if (body.island !== true) {
    await d.store.deleteDevice(deviceId, user);
    return json(200, { ok: true });
  }
  const schedule = parseSchedule(body.schedule);
  const start = token(body.startToken);
  const activity = token(body.activityToken);
  if (!schedule || start === undefined || activity === undefined) return json(400, { error: 'invalid' });
  const existing = await d.store.getDevice(deviceId);
  // a device id another account registered never hands that account's secret to this one
  const secret = existing && existing.user_id === user ? existing.secret : d.newSecret();
  await d.store.upsertDevice({ device_id: deviceId, user_id: user, secret, start_token: start, activity_token: activity, schedule });
  return json(200, { ok: true, secret });
}

/** The app's native code: a new push token (iOS can issue one while Daily's JavaScript isn't running). */
async function tokens(req: Request, d: Deps): Promise<Response> {
  const body = await readJson(req);
  if (!body || typeof body.deviceId !== 'string' || !UUID.test(body.deviceId) || typeof body.secret !== 'string') return json(400, { error: 'invalid' });
  const patch: { start_token?: string | null; activity_token?: string | null } = {};
  if ('startToken' in body) { const t = token(body.startToken); if (t === undefined) return json(400, { error: 'invalid' }); patch.start_token = t; }
  if ('activityToken' in body) { const t = token(body.activityToken); if (t === undefined) return json(400, { error: 'invalid' }); patch.activity_token = t; }
  const ok = await d.store.setTokens(body.deviceId.toLowerCase(), body.secret, patch);
  return ok ? json(200, { ok: true }) : json(404, { error: 'unknown device' });
}

/** pg_cron, every minute: sends what is due for every device, at most once per event. */
async function tick(req: Request, d: Deps): Promise<Response> {
  if (!d.cronSecret || req.headers.get('x-cron-secret') !== d.cronSecret) return json(401, { error: 'unauthorized' });
  if (!d.apns) return json(503, { error: 'apns not configured' });
  const now = d.now();
  let sent = 0;
  const devices = await d.store.devicesWithSchedule();
  for (const dev of devices) {
    if (!dev.schedule) continue;
    for (const e of dueEvents(dev.schedule, now, !!dev.activity_token)) {
      const field = e.action === 'start' ? 'start_token' : 'activity_token';
      const to = dev[field];
      if (!to || !(await d.store.claim(dev.device_id, e.key, now))) continue;
      let status = 0;
      try { status = await d.apns.send(to, livePayload(e, Math.floor(now / 1000))); } catch { status = 0; }
      if (status === 200) { sent++; continue; }
      if (status === 410 || status === 400) { await d.store.clearToken(dev.device_id, field); continue; } // gone or bad: stop using it
      await d.store.unclaim(dev.device_id, e.key); // network/APNs trouble: the next tick retries within the window
    }
  }
  await d.store.prune(now - 3 * 86_400_000);
  return json(200, { devices: devices.length, sent });
}

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  try {
    if (path.endsWith('/sync')) return await sync(req, d);
    if (path.endsWith('/token')) return await tokens(req, d);
    if (path.endsWith('/tick')) return await tick(req, d);
    return json(404, { error: 'not found' });
  } catch (e) {
    console.error('ios-push failed', e);
    return json(500, { error: 'failed' });
  }
}
