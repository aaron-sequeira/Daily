import { describe, expect, it } from 'vitest';
import { bubbleShows } from './bubble';

const base = { plus: true, on: true, serviceOn: true, canDraw: true, hiddenDay: null, today: '2026-10-08', appActive: false, openAndroidCategory: 4 };

describe('bubbleShows (spec §9.5)', () => {
  it('shows for Plus with the switch on, the service running and overlay access', () => {
    expect(bubbleShows(base)).toBe(true);
    for (const off of [{ plus: false }, { on: false }, { serviceOn: false }, { canDraw: false }]) expect(bubbleShows({ ...base, ...off })).toBe(false);
  });

  it('hides over games and video, over Daily itself, and for the rest of a hidden day (Review Focus 5)', () => {
    expect(bubbleShows({ ...base, openAndroidCategory: 0 })).toBe(false); // GAME
    expect(bubbleShows({ ...base, openAndroidCategory: 2 })).toBe(false); // VIDEO
    expect(bubbleShows({ ...base, appActive: true })).toBe(false);
    expect(bubbleShows({ ...base, hiddenDay: '2026-10-08' })).toBe(false);
    expect(bubbleShows({ ...base, hiddenDay: '2026-10-07' })).toBe(true);
    expect(bubbleShows({ ...base, openAndroidCategory: null })).toBe(true);
  });
});
