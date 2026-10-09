import { describe, expect, it } from 'vitest';
import { sync } from '../tracking/sync';
import { makeTestDb } from '../db/testDb';
import { getSetting, setSetting } from '../db/settings';
import { loadToday } from '../today/load';
import { appsForSettings, deleteEverything, exportJson, seedSampleDay, setUserCategory } from './data';

const now = new Date(2026, 9, 6, 21).getTime();

describe('settings data', () => {
  it('exports every table but leaves out icons', async () => {
    const db = await makeTestDb();
    db.run("INSERT INTO apps (package, label, category, icon_png) VALUES ('com.a', 'A', 'fun', 'BIGICON')");
    setSetting(db, 'goal_min', 180);
    const out = JSON.parse(exportJson(db));
    expect(Object.keys(out).sort()).toEqual(['apps', 'exportedAt', 'mood_log', 'nudges', 'pickups', 'reminder_state', 'reminders', 'reports', 'sessions', 'settings', 'water_log', 'weeks']);
    expect(out.apps[0]).toEqual({ package: 'com.a', label: 'A', category: 'fun', user_category: null });
    expect(out.settings).toEqual([{ key: 'goal_min', value: '180' }]);
  });

  it('deletes everything, resets onboarding and parks the sync cursor at now', async () => {
    const db = await makeTestDb();
    seedSampleDay(db, now);
    setSetting(db, 'onboarded', '1');
    db.run('INSERT INTO ingest_state (id, last_event_ms, open_pkg, open_start_ms) VALUES (1, 5, ?, 6)', ['com.a']);
    db.run("INSERT INTO nudges (kind, key, ts_ms) VALUES ('goal80', 'k', 1)");
    db.run("INSERT INTO reports (day, kind, json, created_ms) VALUES ('2026-10-06', 'plain', '{}', 1)");
    db.run("INSERT INTO weeks (week_start, sentence, created_ms) VALUES ('2026-10-05', 'x', 1)");
    deleteEverything(db, now);
    for (const t of ['sessions', 'pickups', 'apps', 'mood_log', 'nudges', 'settings', 'reminders', 'reminder_state', 'water_log', 'reports', 'weeks']) expect(db.all(`SELECT * FROM ${t}`)).toEqual([]);
    expect(db.all('SELECT * FROM ingest_state')).toEqual([{ id: 1, last_event_ms: now, open_pkg: null, open_start_ms: null }]);
    expect(getSetting(db, 'onboarded')).toBe('0');
  });

  it('does not backfill old history after deleting everything', async () => {
    const db = await makeTestDb();
    const events = [
      { type: 'resumed' as const, pkg: 'com.a', ts: now - 86_400_000 },
      { type: 'paused' as const, pkg: 'com.a', ts: now - 86_400_000 + 600_000 },
      { type: 'resumed' as const, pkg: 'com.a', ts: now - 3 * 86_400_000 },
      { type: 'paused' as const, pkg: 'com.a', ts: now - 3 * 86_400_000 + 600_000 }
    ];
    const native = {
      packageName: () => 'com.aaronalex.daily',
      defaultLauncher: () => 'launcher',
      hasUsageAccess: () => true,
      queryEvents: async (from: number, to: number) => events.filter((e) => e.ts >= from && e.ts < to),
      appInfo: async (pkgs: string[]) => pkgs.map((pkg) => ({ pkg, label: pkg, category: -1, icon: null })),
      usageTotals: async () => [],
      unlockCount: async () => 0
    };
    deleteEverything(db, now);
    expect(await sync(db, native, now + 60_000)).toBe('ok');
    expect(db.all('SELECT * FROM sessions')).toEqual([]);
  });

  it('overrides and resets an app category', async () => {
    const db = await makeTestDb();
    db.run("INSERT INTO apps (package, label, category) VALUES ('com.b', 'Bee', 'social'), ('com.a', 'Ant', 'fun')");
    setUserCategory(db, 'com.b', 'work');
    expect(appsForSettings(db)).toEqual([
      { package: 'com.a', label: 'Ant', category: 'fun', overridden: false },
      { package: 'com.b', label: 'Bee', category: 'work', overridden: true }
    ]);
    setUserCategory(db, 'com.b', null);
    expect(appsForSettings(db)[1]).toEqual({ package: 'com.b', label: 'Bee', category: 'social', overridden: false });
  });

  it('seeds a believable day that Today can show', async () => {
    const db = await makeTestDb();
    seedSampleDay(db, now);
    const v = loadToday(db, now);
    expect(v.phoneMin).toBeGreaterThan(120);
    expect(v.categories.length).toBeGreaterThanOrEqual(4);
    expect(v.pickups).toBeGreaterThan(10);
  });
});
