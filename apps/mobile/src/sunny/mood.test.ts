import { describe, expect, it } from 'vitest';
import cases from './mood.cases.json';
import { MOOD_COPY, MOODS, moodFor, moodIndex } from './mood';

describe('moodFor', () => {
  it.each(cases)('$min of $goal min → $mood', ({ min, goal, mood }) => {
    expect(moodFor(min, goal)).toBe(mood);
  });

  it('never divides by zero', () => {
    expect(moodFor(0, 0)).toBe('glowing');
  });

  it('has copy and an index for every mood', () => {
    for (const m of MOODS) expect(MOOD_COPY[m].title.length).toBeGreaterThan(0);
    expect(MOODS.map(moodIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});
