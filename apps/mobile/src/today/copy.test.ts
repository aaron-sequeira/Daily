import { describe, expect, it } from 'vitest';
import { dateLine, goalLine, greeting } from './copy';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();

describe('copy', () => {
  it('greets by time of day', () => {
    expect(greeting(at(6))).toBe('Good morning');
    expect(greeting(at(13))).toBe('Good afternoon');
    expect(greeting(at(21))).toBe('Good evening');
    expect(greeting(at(2))).toBe('Good evening');
  });

  it('writes the date line with the first pickup when there is one', () => {
    expect(dateLine(at(21), at(7, 12))).toBe('Tue 6 Oct · first pickup 7:12 am');
    expect(dateLine(at(21), null)).toBe('Tue 6 Oct');
  });

  it('says time left or over the goal', () => {
    expect(goalLine(48, 240)).toBe('48m left before your 4h goal');
    expect(goalLine(0, 240)).toBe('You\'ve reached your 4h goal');
    expect(goalLine(-62, 240)).toBe('1h 2m over your 4h goal');
  });
});
