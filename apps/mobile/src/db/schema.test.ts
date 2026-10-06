import { describe, expect, it } from 'vitest';
import { makeTestDb } from './testDb';
import { migrate, SCHEMA_VERSION } from './schema';

describe('migrate', () => {
  it('creates every table and records the version', async () => {
    const db = await makeTestDb();
    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
    expect(tables).toEqual(['apps', 'ingest_state', 'mood_log', 'pickups', 'sessions', 'settings']);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(SCHEMA_VERSION);
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
