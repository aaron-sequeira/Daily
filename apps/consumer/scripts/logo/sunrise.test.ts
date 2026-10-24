import { describe, it, expect } from 'vitest';
import { FULL, SMALL, markSvg } from './sunrise.mjs';

const subpaths = (d: string) => (d.match(/M/g) ?? []).length;
// The Daily phone app's mark (apps/mobile/src/ui/Logo.tsx): the desktop draws the same one.
const PHONE_RAYS = 'M19.01,48.92 Q13.78,46.51 8.74,44.59 M31.48,34.27 Q28.33,30.03 25.87,25.86 M50.03,29.24 Q49.51,23.88 50.04,18.51 M67.62,34.54 Q71.02,29.32 74.51,23.81 M79.18,48.33 Q85.67,44.75 92.19,42.23';
const PHONE_HORIZON = 'M14,67 C17,66.58 26,64.5 32,64.5 C38,64.5 44,67 50,67 C56,67 62,64.58 68,64.5 C74,64.42 83,66.17 86,66.5';

describe('the Daily mark', () => {
  it('is the phone mark: a filled sun with Sunny’s face, five rays and the wavy horizon', () => {
    for (const m of [FULL, SMALL]) {
      expect(m.rays).toBe(PHONE_RAYS);
      expect(subpaths(m.rays)).toBe(5);
      expect(m.horizon).toBe(PHONE_HORIZON);
      expect(m.sun).toEqual({ cx: 50, cy: 64, r: 21 });
      expect(m.face).toEqual({ eyes: 'M43.5 52 L43.5 54 M56.5 52 L56.5 54', smile: 'M44.8 57.6 Q50 61.4 55.2 57.6' });
      expect(m.clipY).toBe(64);
    }
  });
  it('markSvg draws the tile, the filled sun, the face, rays and horizon in the phone colours', () => {
    const svg = markSvg(FULL, { size: 64 });
    expect(svg).toContain('width="64"');
    expect(svg).toContain('fill="#171717"');
    expect(svg).toContain('<circle cx="50" cy="64" r="21" fill="#F6B35E"');
    expect(svg).toContain('stroke="#3A2412"');
    expect(svg).toContain(PHONE_RAYS);
    expect(svg).toContain(PHONE_HORIZON);
    expect(markSvg(FULL, { size: 64, tile: false })).not.toContain('fill="#171717"');
  });
});
