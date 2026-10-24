import { describe, it, expect } from 'vitest';
import type { Chapter } from '../../main/replay/chapters';
import { dayWindow, hourTicks, ribbon, shotsFor } from './replay';

const H = 3_600_000;
const T0 = new Date(2026, 9, 22, 0, 0).getTime();
const ch = (id: string, startH: number, endH: number, app = 'Code', category = 'work'): Chapter =>
  ({ id, start: T0 + startH * H, end: T0 + endH * H, category, title: `${app} · x`, apps: [{ app, minutes: (endH - startH) * 60 }], seen: [], switches: 0 });

describe('replay view helpers', () => {
  it('ribbon places chapters by time', () => {
    const r = ribbon([ch('a', 9, 10), ch('b', 11, 13, 'Chrome', 'other')], T0 + 9 * H, T0 + 13 * H);
    expect(r).toEqual([
      { id: 'a', leftPct: 0, widthPct: 25, label: 'Code', category: 'work' },
      { id: 'b', leftPct: 50, widthPct: 50, label: 'Chrome', category: 'other' }
    ]);
  });

  it('dayWindow spans the chapters on whole hours', () => {
    expect(dayWindow([ch('a', 9.5, 10), ch('b', 13, 14.25)])).toEqual([T0 + 9 * H, T0 + 15 * H]);
    expect(dayWindow([])).toBeNull();
  });

  it('hourTicks labels every other hour inside the window', () => {
    expect(hourTicks(T0 + 8 * H, T0 + 13 * H)).toEqual([
      { pct: 0, label: '8 am' }, { pct: 40, label: '10 am' }, { pct: 80, label: '12 pm' }
    ]);
  });

  it('shotsFor keeps only shots inside the chapter', () => {
    const shots = [T0 + 8.9 * H, T0 + 9 * H, T0 + 9.5 * H, T0 + 10 * H, T0 + 10.1 * H].map((at) => ({ at, app: 'Code', title: null, url: `u${at}` }));
    expect(shotsFor(ch('a', 9, 10), shots).map((s) => s.at)).toEqual([T0 + 9 * H, T0 + 9.5 * H, T0 + 10 * H]);
  });
});
