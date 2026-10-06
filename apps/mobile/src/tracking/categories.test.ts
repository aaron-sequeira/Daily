import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_LOOK, categoryFor, isCategory } from './categories';

describe('categoryFor', () => {
  it('lets the user override everything', () => {
    expect(categoryFor('com.whatsapp', 4, 'work')).toBe('work');
  });

  it("uses the built-in list before Android's category", () => {
    expect(categoryFor('com.whatsapp', 4, null)).toBe('messages'); // Android says SOCIAL
    expect(categoryFor('com.duolingo', 0, null)).toBe('learning'); // Android says GAME
  });

  it('maps Android categories', () => {
    expect(categoryFor('x.game', 0, null)).toBe('fun');
    expect(categoryFor('x.video', 2, null)).toBe('fun');
    expect(categoryFor('x.social', 4, null)).toBe('social');
    expect(categoryFor('x.tool', 7, null)).toBe('work');
    expect(categoryFor('x.maps', 6, null)).toBe('other');
  });

  it('falls back to other, and ignores a junk override', () => {
    expect(categoryFor('x.unknown', -1, null)).toBe('other');
    expect(categoryFor('x.unknown', -1, 'nonsense')).toBe('other');
  });

  it('has a label and colour for every category', () => {
    for (const c of CATEGORIES) expect(CATEGORY_LOOK[c].color).toMatch(/^#[0-9A-F]{6}$/);
    expect(isCategory('fun')).toBe(true);
    expect(isCategory('games')).toBe(false);
  });
});
