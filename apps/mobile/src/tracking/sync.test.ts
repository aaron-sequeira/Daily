import { describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import type { RawEvent } from './ingest';
import { loadState, phoneMsForDay, sync, type SyncNative } from './sync';

const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();

function fakeNative(events: RawEvent[], access = true): SyncNative & { appInfo: ReturnType<typeof vi.fn> } {
  return {
    packageName: () => 'com.aaronalex.daily',
    defaultLauncher: () => 'launcher',
    hasUsageAccess: () => access,
    queryEvents: async (from, to) => events.filter((e) => e.ts >= from && e.ts < to),
    appInfo: vi.fn(async (pkgs: string[]) => pkgs.map((pkg) => ({ pkg, label: pkg.toUpperCase(), category: 4, icon: null })))
  };
}

const morning: RawEvent[] = [
  { type: 'unlock', pkg: 'android', ts: at(8) },
  { type: 'resumed', pkg: 'com.whatsapp', ts: at(8, 1) },
  { type: 'resumed', pkg: 'com.aaronalex.daily', ts: at(8, 11) },
  { type: 'resumed', pkg: 'com.instagram.android', ts: at(8, 15) },
  { type: 'screen_off', pkg: 'android', ts: at(8, 45) }
];

describe('sync', () => {
  it('does nothing without usage access (Review Focus 3)', async () => {
    const db = await makeTestDb();
    expect(await sync(db, fakeNative(morning, false), at(9))).toBe('no_access');
    expect(db.all('SELECT * FROM sessions')).toEqual([]);
  });

  it('stores sessions, pickups, apps and state; skips Daily itself', async () => {
    const db = await makeTestDb();
    expect(await sync(db, fakeNative(morning), at(9))).toBe('ok');
    const rows = db.all<{ package: string; start_ms: number; end_ms: number }>('SELECT package, start_ms, end_ms FROM sessions ORDER BY start_ms');
    expect(rows.map((r) => r.package)).toEqual(['com.whatsapp', 'com.instagram.android']);
    expect(db.all('SELECT * FROM pickups')).toHaveLength(1);
    const apps = db.all<{ package: string; category: string; label: string }>('SELECT package, category, label FROM apps ORDER BY package');
    expect(apps).toEqual([
      { package: 'com.instagram.android', category: 'social', label: 'COM.INSTAGRAM.ANDROID' },
      { package: 'com.whatsapp', category: 'messages', label: 'COM.WHATSAPP' }
    ]);
    expect(loadState(db).lastEventMs).toBe(at(8, 45));
  });

  it('re-sync returns no duplicates (Review Focus 1)', async () => {
    const db = await makeTestDb();
    const native = fakeNative(morning);
    await sync(db, native, at(9));
    db.run('UPDATE ingest_state SET last_event_ms = 0'); // force the same events to be read again
    await sync(db, native, at(9, 5));
    expect(db.all('SELECT * FROM sessions')).toHaveLength(2);
    expect(db.all('SELECT * FROM pickups')).toHaveLength(1);
  });

  it('asks Android about each app only once', async () => {
    const db = await makeTestDb();
    const native = fakeNative(morning);
    await sync(db, native, at(9));
    await sync(db, native, at(9, 5));
    expect(native.appInfo).toHaveBeenCalledTimes(1);
  });

  it('logs a mood only when it changes', async () => {
    const db = await makeTestDb();
    setSetting(db, 'goal_min', 60);
    await sync(db, fakeNative(morning), at(9)); // 40 min of 60 → happy
    await sync(db, fakeNative(morning), at(9, 1));
    expect(db.all<{ mood: string }>('SELECT mood FROM mood_log').map((r) => r.mood)).toEqual(['happy']);
    setSetting(db, 'goal_min', 30); // 40 of 30 → sad
    await sync(db, fakeNative(morning), at(9, 2));
    expect(db.all<{ mood: string }>('SELECT mood FROM mood_log ORDER BY ts_ms').map((r) => r.mood)).toEqual(['happy', 'sad']);
  });

  it('counts the app that is still open', async () => {
    const db = await makeTestDb();
    await sync(db, fakeNative([{ type: 'resumed', pkg: 'com.a', ts: at(10) }]), at(10, 20));
    expect(phoneMsForDay(db, '2026-10-06', at(10, 20))).toBe(20 * 60_000);
  });

  it('deletes history older than the retention setting', async () => {
    const db = await makeTestDb();
    setSetting(db, 'retention_days', 30);
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('old', 1, 2, '2026-08-01')");
    db.run("INSERT INTO pickups (ts_ms, day) VALUES (1, '2026-08-01')");
    await sync(db, fakeNative(morning), at(9));
    expect(db.all("SELECT * FROM sessions WHERE package = 'old'")).toEqual([]);
    expect(db.all("SELECT * FROM pickups WHERE day = '2026-08-01'")).toEqual([]);
  });
});
