import { describe, expect, it } from 'vitest';
import { LOOK, raysPath } from './look';
import { MOODS } from './mood';

describe('raysPath', () => {
  it('draws nothing for zero rays', () => {
    expect(raysPath(0, 10)).toBe('');
  });

  it('starts the first ray straight up from radius 42', () => {
    expect(raysPath(4, 10).startsWith('M60.0 18.0 L60.0 8.0')).toBe(true);
    expect(raysPath(4, 10).match(/M/g)).toHaveLength(4);
  });
});

describe('LOOK', () => {
  it('has a look for every mood plus unknown, dimming as the mood drops', () => {
    for (const m of [...MOODS, 'unknown' as const]) expect(LOOK[m].body).toMatch(/^#/);
    expect(MOODS.map((m) => LOOK[m].rays)).toEqual([12, 12, 10, 9, 8]);
    expect(LOOK.sad.tear && LOOK.sad.cloud).toBe(true);
    expect(LOOK.glowing.sparkle).toBe(true);
  });
});
