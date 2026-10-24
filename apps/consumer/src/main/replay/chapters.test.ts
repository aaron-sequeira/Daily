import { describe, it, expect } from 'vitest';
import { buildChapters, sessionsToEpisodes, type ChapterEpisode } from './chapters';

const M = 60_000;
const T0 = new Date(2026, 9, 22, 9, 0).getTime();
const ep = (startMin: number, endMin: number, app: string, category: string, titles: string[] = []): ChapterEpisode =>
  ({ start: T0 + startMin * M, end: T0 + endMin * M, app, category, titles });

describe('buildChapters', () => {
  it('merges same-category episodes across short gaps', () => {
    const ch = buildChapters([ep(0, 20, 'Code', 'work'), ep(25, 50, 'Terminal', 'work'), ep(70, 100, 'Code', 'work')]);
    expect(ch.map((c) => [c.start, c.end])).toEqual([[T0, T0 + 50 * M], [T0 + 70 * M, T0 + 100 * M]]); // 20-min gap splits
    expect(ch[0].category).toBe('work');
  });

  it('folds a chapter under 10 minutes into its neighbour', () => {
    const ch = buildChapters([ep(0, 40, 'Code', 'work'), ep(40, 45, 'Discord', 'social'), ep(45, 60, 'Chrome', 'other')]);
    expect(ch).toHaveLength(2);
    expect(ch[0]).toMatchObject({ start: T0, end: T0 + 45 * M, category: 'work' }); // the longer neighbour takes it
    expect(ch[0].apps).toEqual([{ app: 'Code', minutes: 40 }, { app: 'Discord', minutes: 5 }]);
    expect(ch[1]).toMatchObject({ start: T0 + 45 * M, category: 'other' });
  });

  it('keeps a lone short chapter rather than dropping the day', () => {
    expect(buildChapters([ep(0, 4, 'Code', 'work')])).toHaveLength(1);
  });

  it('titles a chapter by its top app and title', () => {
    const ch = buildChapters([ep(0, 30, 'Code', 'work', ['app.ts - proj']), ep(30, 40, 'Code', 'work', ['app.ts - proj']),
      ep(40, 45, 'Code', 'work', ['other.ts']), ep(45, 50, 'Terminal', 'work', ['pnpm'])]);
    expect(ch[0].title).toBe('Code · app.ts - proj');
    expect(ch[0].seen).toEqual(['app.ts - proj', 'other.ts', 'pnpm']);
    const long = buildChapters([ep(0, 30, 'Chrome', 'other', ['x'.repeat(100)])]);
    expect(long[0].title.length).toBe(60);
    expect(buildChapters([ep(0, 30, 'Chrome', 'other')])[0].title).toBe('Chrome');
  });

  it('keeps at most 8 things seen', () => {
    const eps = Array.from({ length: 12 }, (_, i) => ep(i * 5, i * 5 + 5, 'Chrome', 'other', [`page ${i}`]));
    expect(buildChapters(eps)[0].seen).toHaveLength(8);
  });

  it('counts app switches', () => {
    const ch = buildChapters([ep(0, 10, 'Code', 'work'), ep(10, 20, 'Terminal', 'work'), ep(20, 30, 'Terminal', 'work'), ep(30, 40, 'Code', 'work')]);
    expect(ch[0].switches).toBe(2);
  });

  it('an empty day gives no chapters', () => {
    expect(buildChapters([])).toEqual([]);
  });
});

describe('sessionsToEpisodes', () => {
  it('maps focus sessions, closing an open one at now, with the app-based category', () => {
    const rows = [
      { id: 1, appName: 'Code.exe', appPath: null, windowTitle: 'a.ts', pid: 1, startedAt: T0, endedAt: T0 + 10 * M, durationSec: 600, date: '2026-10-22' },
      { id: 2, appName: 'Discord', appPath: null, windowTitle: null, pid: 2, startedAt: T0 + 10 * M, endedAt: null, durationSec: null, date: '2026-10-22' }
    ];
    expect(sessionsToEpisodes(rows, T0 + 15 * M)).toEqual([
      { start: T0, end: T0 + 10 * M, app: 'Code', category: 'work', titles: ['a.ts'] },
      { start: T0 + 10 * M, end: T0 + 15 * M, app: 'Discord', category: 'social', titles: [] }
    ]);
  });
});
