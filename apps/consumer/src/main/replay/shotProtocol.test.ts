import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { shotPath } from './shotProtocol';

const DIR = join('C:\\', 'Users', 'me', 'AppData', 'Roaming', 'Daily', 'shots');

describe('shotPath', () => {
  it('maps daily-shot://2026-10-22/123.jpg into the shots folder', () => {
    expect(shotPath(DIR, 'daily-shot://2026-10-22/123.jpg')).toBe(join(DIR, '2026-10-22', '123.jpg'));
  });

  it('refuses paths outside the shots folder', () => {
    for (const url of [
      'daily-shot://2026-10-22/../../daylens.sqlite',
      'daily-shot://2026-10-22/%2e%2e/%2e%2e/daylens.sqlite',
      'daily-shot://2026-10-22/..%2f..%2fdaylens.sqlite',
      'daily-shot://2026-10-22/..%5c..%5cdaylens.sqlite',
      'daily-shot://C:/Windows/win.ini',
      'daily-shot:///C:/x/1.jpg',
      'daily-shot://2026-10-22/123.png',
      'daily-shot://2026-10-22/123.jpg.exe',
      'daily-shot://notadate/123.jpg',
      'daily-shot://2026-10-22/123.jpg?x=1',
      'file:///C:/x/2026-10-22/123.jpg',
      'not a url'
    ]) expect(shotPath(DIR, url), url).toBeNull();
  });
});
