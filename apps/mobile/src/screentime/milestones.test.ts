import { describe, expect, it } from 'vitest';
import { phoneMinToday, thresholds } from './milestones';

// Tue 6 Oct 2026 in Asia/Kolkata (vitest.setup.ts).
const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();

describe('thresholds', () => {
  it('has every 10% of the goal to 150% and every full hour to 12 h, sorted and unique', () => {
    const t = thresholds(240);
    expect(t.slice(0, 5)).toEqual([24, 48, 60, 72, 96]);
    expect(t).toContain(360); // 150% of 240 and also 6 h: once
    expect(t.filter((m) => m === 120)).toHaveLength(1);
    expect(t[t.length - 1]).toBe(720);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
  });
  it('stays within DeviceActivity limits for any goal', () => {
    for (const g of [15, 30, 60, 240, 600, 1440]) {
      const t = thresholds(g);
      expect(t.length).toBeLessThanOrEqual(40);
      expect(t.every((m) => Number.isInteger(m) && m >= 1)).toBe(true);
    }
  });
});

describe('phoneMinToday', () => {
  it('is the highest milestone reached today', () => {
    expect(phoneMinToday([{ min: 24, atMs: at(9) }, { min: 60, atMs: at(11) }, { min: 48, atMs: at(10) }], at(12))).toBe(60);
  });
  it('ignores yesterday', () => {
    expect(phoneMinToday([{ min: 300, atMs: at(22, 0, 5) }, { min: 24, atMs: at(9) }], at(12))).toBe(24);
  });
  it('is 0 with nothing today', () => {
    expect(phoneMinToday([], at(12))).toBe(0);
  });
});

