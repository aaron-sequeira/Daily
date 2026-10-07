import { describe, expect, it } from 'vitest';
import { chipContent } from './chip';

describe('chipContent', () => {
  it('shows phone time, Sunny’s mood and the goal', () => {
    expect(chipContent({ access: true, phoneMin: 192, goalMin: 240, leftMin: 48, mood: 'alright' })).toEqual({
      title: '3h 12m today', short: '3h 12m', text: "Sunny's doing alright · 48m left before your 4h goal", mood: 'alright'
    });
  });
  it('asks for usage access when Daily can’t see the day', () => {
    expect(chipContent({ access: false, phoneMin: 0, goalMin: 240, leftMin: 240, mood: 'glowing' })).toEqual({
      title: 'Daily', short: 'Daily', text: 'Turn on usage access so Sunny can see your day', mood: 'unknown'
    });
  });
});
