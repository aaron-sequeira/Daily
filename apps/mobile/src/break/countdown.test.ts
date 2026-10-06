import { describe, expect, it } from 'vitest';
import { formatClock, ringOffset, secondsLeft } from './countdown';

describe('countdown', () => {
  it.each([[102, '1:42'], [60, '1:00'], [9, '0:09'], [0, '0:00'], [1800, '30:00']])('%s s → %s', (s, out) => {
    expect(formatClock(s)).toBe(out);
  });
  it('counts down from the start time and never below zero', () => {
    expect(secondsLeft(1_000, 300, 1_000)).toBe(300);
    expect(secondsLeft(1_000, 300, 61_500)).toBe(240);
    expect(secondsLeft(1_000, 300, 999_999)).toBe(0);
  });
  it('empties the ring as time runs out', () => {
    expect(ringOffset(300, 300, 880)).toBe(0);
    expect(ringOffset(150, 300, 880)).toBe(440);
    expect(ringOffset(0, 300, 880)).toBe(880);
  });
});
