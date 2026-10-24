import type Database from 'better-sqlite3';
import { mkdirSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Screenshots for Replay: only taken when the user turned them on; kept on this PC only, as JPEG files under
 * `<dir>/<date>/<at>.jpg`, with one row each so a day's shots are found without listing folders. */
export const SHOTS_SQL = `
CREATE TABLE IF NOT EXISTS screen_shots (at INTEGER PRIMARY KEY, date TEXT NOT NULL, app TEXT NOT NULL, title TEXT, file TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_shots_date ON screen_shots(date, at);
`;

export interface ShotRow { at: number; app: string; title: string | null; file: string }
export interface ShotStore {
  save(s: { at: number; date: string; app: string; title: string | null; jpg: string }): void;
  forDay(date: string): ShotRow[];
  /** Deletes the files and rows of shots taken before `ms`; returns how many. */
  purgeBefore(ms: number): number;
  /** Delete everything: the whole folder and every row. */
  deleteAll(): void;
}

export function createShotStore(db: Database.Database, dir: string): ShotStore {
  const ins = db.prepare('INSERT OR REPLACE INTO screen_shots (at, date, app, title, file) VALUES (?, ?, ?, ?, ?)');
  const day = db.prepare('SELECT at, app, title, file FROM screen_shots WHERE date = ? ORDER BY at');
  const old = db.prepare('SELECT file FROM screen_shots WHERE at < ?');
  const delOld = db.prepare('DELETE FROM screen_shots WHERE at < ?');
  return {
    save({ at, date, app, title, jpg }) {
      const file = join(dir, date, `${at}.jpg`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(jpg, 'base64'));
      ins.run(at, date, app, title, file);
    },
    forDay: (date) => day.all(date) as ShotRow[],
    purgeBefore(ms) {
      const files = (old.all(ms) as { file: string }[]).map((r) => r.file);
      for (const f of files) rmSync(f, { force: true });
      for (const d of new Set(files.map((f) => dirname(f)))) {
        try { if (readdirSync(d).length === 0) rmdirSync(d); } catch { /* already gone */ }
      }
      return delOld.run(ms).changes;
    },
    deleteAll() {
      rmSync(dir, { recursive: true, force: true });
      db.exec('DELETE FROM screen_shots');
    }
  };
}
