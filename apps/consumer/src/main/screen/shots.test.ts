import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHOTS_SQL, createShotStore } from './shots';

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
let db: Database.Database;
let dir: string;
beforeEach(() => {
  db = new Database(':memory:'); db.exec(SHOTS_SQL);
  dir = join(mkdtempSync(join(tmpdir(), 'daily-shots-')), 'shots');
});

describe('shot store', () => {
  it('saves the file and the row', () => {
    const s = createShotStore(db, dir);
    s.save({ at: 1000, date: '2026-10-22', app: 'Code', title: 'a.ts', jpg: JPG });
    const file = join(dir, '2026-10-22', '1000.jpg');
    expect(readFileSync(file).toString('base64')).toBe(JPG);
    expect(s.forDay('2026-10-22')).toEqual([{ at: 1000, app: 'Code', title: 'a.ts', file }]);
    expect(s.forDay('2026-10-23')).toEqual([]);
  });

  it('purgeBefore deletes old files and rows, keeps new ones', () => {
    const s = createShotStore(db, dir);
    s.save({ at: 1000, date: '2026-10-20', app: 'Code', title: null, jpg: JPG });
    s.save({ at: 5000, date: '2026-10-22', app: 'Code', title: null, jpg: JPG });
    expect(s.purgeBefore(3000)).toBe(1);
    expect(existsSync(join(dir, '2026-10-20', '1000.jpg'))).toBe(false);
    expect(existsSync(join(dir, '2026-10-20'))).toBe(false); // an emptied day folder goes too
    expect(existsSync(join(dir, '2026-10-22', '5000.jpg'))).toBe(true);
    expect(s.forDay('2026-10-20')).toEqual([]);
    expect(s.forDay('2026-10-22')).toHaveLength(1);
  });

  it('deleteAll removes the folder', () => {
    const s = createShotStore(db, dir);
    s.save({ at: 1000, date: '2026-10-22', app: 'Code', title: null, jpg: JPG });
    s.deleteAll();
    expect(existsSync(dir)).toBe(false);
    expect(s.forDay('2026-10-22')).toEqual([]);
    s.save({ at: 2000, date: '2026-10-22', app: 'Code', title: null, jpg: JPG }); // and it still works after
    expect(s.forDay('2026-10-22')).toHaveLength(1);
  });
});
