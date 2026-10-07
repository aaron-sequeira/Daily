import { describe, expect, it } from 'vitest';
import { makeRawTestDb, makeTestDb } from './testDb';
import { migrate, MIGRATIONS, SCHEMA_VERSION } from './schema';

describe('migrate', () => {
  it('creates every table and records the version', async () => {
    const db = await makeTestDb();
    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
    expect(tables).toEqual(['apps', 'ingest_state', 'mood_log', 'nudges', 'pickups', 'reminder_state', 'reminders', 'sessions', 'settings', 'water_log']);
    expect(SCHEMA_VERSION).toBe(3);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(3);
  });

  it('upgrades a version-1 database and keeps its data', async () => {
    const db = await makeRawTestDb();
    db.exec(MIGRATIONS[0]);
    db.exec('PRAGMA user_version = 1');
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.a', 1, 2, '2026-10-06')");
    migrate(db);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(3);
    expect(db.all('SELECT * FROM sessions')).toHaveLength(1);
    expect(db.all('SELECT * FROM reminders')).toEqual([]);
  });

  it('upgrades a version-2 database, keeping apps and adding android_category', async () => {
    const db = await makeRawTestDb();
    db.exec(MIGRATIONS[0]); db.exec(MIGRATIONS[1]);
    db.exec('PRAGMA user_version = 2');
    db.run("INSERT INTO apps (package, label, category) VALUES ('com.a', 'A', 'fun')");
    migrate(db);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(3);
    expect(db.get<{ android_category: number | null }>("SELECT android_category FROM apps WHERE package = 'com.a'")).toEqual({ android_category: null });
    expect(db.all('SELECT * FROM nudges')).toEqual([]);
  });

  it('is safe to run twice', async () => {
    const db = await makeTestDb();
    expect(() => migrate(db)).not.toThrow();
  });

  it('ignores a duplicate session for the same app and start', async () => {
    const db = await makeTestDb();
    const row = ['com.x', 1000, 2000, '2026-10-06'];
    db.run('INSERT OR IGNORE INTO sessions (package, start_ms, end_ms, day) VALUES (?,?,?,?)', row);
    db.run('INSERT OR IGNORE INTO sessions (package, start_ms, end_ms, day) VALUES (?,?,?,?)', row);
    expect(db.all('SELECT * FROM sessions')).toHaveLength(1);
  });
});
