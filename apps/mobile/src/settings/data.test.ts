import { describe, expect, it } from 'vitest';
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
    expect(Object.keys(out).sort()).toEqual(['apps', 'exportedAt', 'mood_log', 'pickups', 'sessions', 'settings']);
    expect(out.apps[0]).toEqual({ package: 'com.a', label: 'A', category: 'fun', user_category: null });
    expect(out.settings).toEqual([{ key: 'goal_min', value: '180' }]);
  });

  it('deletes everything and resets onboarding', async () => {
    const db = await makeTestDb();
    seedSampleDay(db, now);
    setSetting(db, 'onboarded', '1');
    deleteEverything(db);
    for (const t of ['sessions', 'pickups', 'apps', 'ingest_state', 'mood_log', 'settings']) expect(db.all(`SELECT * FROM ${t}`)).toEqual([]);
    expect(getSetting(db, 'onboarded')).toBe('0');
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
