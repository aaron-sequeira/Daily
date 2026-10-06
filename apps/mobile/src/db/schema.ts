import type { Db } from './db';

export const MIGRATIONS: string[] = [
  `CREATE TABLE sessions (id INTEGER PRIMARY KEY, package TEXT NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, day TEXT NOT NULL);
   CREATE UNIQUE INDEX sessions_unique ON sessions(package, start_ms);
   CREATE INDEX sessions_day ON sessions(day);
   CREATE TABLE pickups (ts_ms INTEGER PRIMARY KEY, day TEXT NOT NULL);
   CREATE INDEX pickups_day ON pickups(day);
   CREATE TABLE apps (package TEXT PRIMARY KEY, label TEXT NOT NULL, category TEXT NOT NULL, user_category TEXT, icon_png TEXT);
   CREATE TABLE ingest_state (id INTEGER PRIMARY KEY CHECK (id = 1), last_event_ms INTEGER NOT NULL, open_pkg TEXT, open_start_ms INTEGER);
   CREATE TABLE mood_log (day TEXT NOT NULL, ts_ms INTEGER NOT NULL, mood TEXT NOT NULL);
   CREATE INDEX mood_log_day ON mood_log(day);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  `CREATE TABLE reminders (id INTEGER PRIMARY KEY, builtin TEXT UNIQUE, name TEXT NOT NULL, message TEXT NOT NULL, animation TEXT NOT NULL, schedule TEXT NOT NULL, break_sec INTEGER NOT NULL, enabled INTEGER NOT NULL);
   CREATE TABLE reminder_state (id INTEGER PRIMARY KEY, last_fired_at INTEGER, last_done_at INTEGER, skip_date TEXT);
   CREATE TABLE water_log (ts_ms INTEGER PRIMARY KEY, day TEXT NOT NULL);
   CREATE INDEX water_log_day ON water_log(day);`
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: Db): void {
  const current = db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.tx(() => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
