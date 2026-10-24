import * as realFs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateUserData } from './migrate';

function appData(opts: { old?: boolean; daily?: 'none' | 'empty' | 'other' | 'data' }) {
  const root = mkdtempSync(join(tmpdir(), 'daily-migrate-'));
  if (opts.old) {
    mkdirSync(join(root, 'Daylens', 'models'), { recursive: true });
    writeFileSync(join(root, 'Daylens', 'daylens.sqlite'), 'old');
    writeFileSync(join(root, 'Daylens', 'daylens.sqlite-wal'), 'wal');
  }
  if (opts.daily && opts.daily !== 'none') mkdirSync(join(root, 'Daily'));
  if (opts.daily === 'other') writeFileSync(join(root, 'Daily', 'notes.txt'), 'another app called Daily');
  if (opts.daily === 'data') writeFileSync(join(root, 'Daily', 'daylens.sqlite'), 'new');
  return root;
}
const read = (p: string) => realFs.readFileSync(p, 'utf8');
const nothingHalfMade = (root: string) => expect(readdirSync(root).filter((n) => n.startsWith('Daily.migrating'))).toEqual([]);

describe('migrateUserData', () => {
  it('moves Daylens to Daily, with the database and its write-ahead log', () => {
    const root = appData({ old: true });
    expect(migrateUserData(root)).toBe('moved');
    expect(read(join(root, 'Daily', 'daylens.sqlite'))).toBe('old');
    expect(read(join(root, 'Daily', 'daylens.sqlite-wal'))).toBe('wal');
    expect(existsSync(join(root, 'Daily', 'models'))).toBe(true);
    expect(existsSync(join(root, 'Daylens'))).toBe(false);
    nothingHalfMade(root);
  });

  it('never deletes a Daily folder without our database: it is set aside, kept whole', () => {
    for (const daily of ['empty', 'other'] as const) {
      const root = appData({ old: true, daily });
      expect(migrateUserData(root)).toBe('moved');
      expect(read(join(root, 'Daily', 'daylens.sqlite'))).toBe('old');
      const aside = readdirSync(root).filter((n) => n.startsWith('Daily.before-daylens-'));
      expect(aside).toHaveLength(1);
      if (daily === 'other') expect(read(join(root, aside[0], 'notes.txt'))).toBe('another app called Daily');
    }
  });

  it('does nothing when Daily already has its own database, or on a fresh install', () => {
    const root = appData({ old: true, daily: 'data' });
    expect(migrateUserData(root)).toBe('none');
    expect(read(join(root, 'Daily', 'daylens.sqlite'))).toBe('new');
    expect(existsSync(join(root, 'Daylens', 'daylens.sqlite'))).toBe(true);
    expect(migrateUserData(appData({}))).toBe('none');
  });

  it('copies through a temporary folder, keeping the original, when the folder cannot be renamed', () => {
    const root = appData({ old: true });
    const fs = { ...realFs, renameSync: (a: realFs.PathLike, b: realFs.PathLike) => {
      if (String(a).endsWith('Daylens')) throw Object.assign(new Error('busy'), { code: 'EPERM' });
      return realFs.renameSync(a, b);
    } };
    expect(migrateUserData(root, fs)).toBe('copied');
    expect(read(join(root, 'Daily', 'daylens.sqlite'))).toBe('old');
    expect(existsSync(join(root, 'Daylens', 'daylens.sqlite'))).toBe(true);
    nothingHalfMade(root);
  });

  it('fails cleanly when the copy fails too: no half-made Daily, Daylens untouched, so the next launch retries', () => {
    const root = appData({ old: true });
    const fs = {
      ...realFs,
      renameSync: (a: realFs.PathLike, b: realFs.PathLike) => { if (String(a).endsWith('Daylens')) throw new Error('busy'); return realFs.renameSync(a, b); },
      cpSync: () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); }
    };
    expect(migrateUserData(root, fs)).toBe('failed');
    expect(existsSync(join(root, 'Daily'))).toBe(false);
    expect(read(join(root, 'Daylens', 'daylens.sqlite'))).toBe('old');
    nothingHalfMade(root);
    expect(migrateUserData(root)).toBe('moved'); // and the retry works
  });

  it('a second launch waits out a migration in progress; a lock left by a crash expires', () => {
    const root = appData({ old: true });
    writeFileSync(join(root, 'Daily.migrating.lock'), '');
    expect(migrateUserData(root)).toBe('busy');
    expect(existsSync(join(root, 'Daylens', 'daylens.sqlite'))).toBe(true);
    const old = new Date(Date.now() - 11 * 60_000);
    utimesSync(join(root, 'Daily.migrating.lock'), old, old);
    expect(migrateUserData(root)).toBe('moved');
    expect(existsSync(join(root, 'Daily.migrating.lock'))).toBe(false);
  });
});
