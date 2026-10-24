import * as realFs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateUserData } from './migrate';

function appData(opts: { old?: boolean; daily?: 'none' | 'empty' | 'junk' | 'data' }) {
  const root = mkdtempSync(join(tmpdir(), 'daily-migrate-'));
  if (opts.old) { mkdirSync(join(root, 'Daylens', 'models'), { recursive: true }); writeFileSync(join(root, 'Daylens', 'daylens.sqlite'), 'old'); }
  if (opts.daily && opts.daily !== 'none') mkdirSync(join(root, 'Daily'));
  if (opts.daily === 'junk') writeFileSync(join(root, 'Daily', 'Local State'), '{}');
  if (opts.daily === 'data') writeFileSync(join(root, 'Daily', 'daylens.sqlite'), 'new');
  return root;
}
const read = (p: string) => realFs.readFileSync(p, 'utf8');

describe('migrateUserData', () => {
  it('moves Daylens to Daily when Daily does not exist', () => {
    const root = appData({ old: true });
    expect(migrateUserData(root)).toBe('moved');
    expect(read(join(root, 'Daily', 'daylens.sqlite'))).toBe('old');
    expect(existsSync(join(root, 'Daily', 'models'))).toBe(true);
    expect(existsSync(join(root, 'Daylens'))).toBe(false);
  });

  it('also moves when Daily exists but holds no database yet (Electron created it early)', () => {
    for (const daily of ['empty', 'junk'] as const) {
      const root = appData({ old: true, daily });
      expect(migrateUserData(root)).toBe('moved');
      expect(read(join(root, 'Daily', 'daylens.sqlite'))).toBe('old');
    }
  });

  it('does nothing when Daily already has its own database', () => {
    const root = appData({ old: true, daily: 'data' });
    expect(migrateUserData(root)).toBe('none');
    expect(read(join(root, 'Daily', 'daylens.sqlite'))).toBe('new');
    expect(existsSync(join(root, 'Daylens', 'daylens.sqlite'))).toBe(true);
  });

  it('does nothing on a fresh install', () => {
    expect(migrateUserData(appData({}))).toBe('none');
  });

  it('copies, keeping the original, when the folder cannot be renamed', () => {
    const root = appData({ old: true });
    const fs = { ...realFs, renameSync: () => { throw Object.assign(new Error('busy'), { code: 'EPERM' }); } };
    expect(migrateUserData(root, fs)).toBe('copied');
    expect(read(join(root, 'Daily', 'daylens.sqlite'))).toBe('old');
    expect(existsSync(join(root, 'Daylens', 'daylens.sqlite'))).toBe(true);
  });
});
