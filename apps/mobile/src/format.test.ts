import { describe, expect, it } from 'vitest';
import { formatDuration, hourLabel } from './format';

describe('formatDuration', () => {
  it.each([[0, '0m'], [0.4, '0m'], [48, '48m'], [60, '1h'], [192, '3h 12m'], [240, '4h'], [59.6, '1h']])('%s → %s', (min, out) => {
    expect(formatDuration(min)).toBe(out);
  });
});

describe('hourLabel', () => {
  it.each([[0, '12 am'], [7, '7 am'], [12, '12 pm'], [15, '3 pm'], [23, '11 pm'], [24, '12 am']])('%s → %s', (h, out) => {
    expect(hourLabel(h)).toBe(out);
  });
});
