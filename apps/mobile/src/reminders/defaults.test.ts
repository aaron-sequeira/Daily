import { describe, expect, it } from 'vitest';
import { validateReminder } from '@worksight/core/reminders';
import { ANIM_LOOK, MOBILE_ANIMATIONS, mobileDefaults, sceneKind } from './defaults';

describe('mobileDefaults', () => {
  it("has the spec's four built-ins", () => {
    const d = mobileDefaults();
    expect(d.map((r) => r.builtin)).toEqual(['water', 'lunch', 'tea', 'dinner']);
    expect(d.find((r) => r.builtin === 'water')!.schedule).toEqual({ type: 'interval', minutes: 60 });
    expect(d.find((r) => r.builtin === 'lunch')!.schedule).toEqual({ type: 'time', time: '13:00', days: [1, 2, 3, 4, 5] });
    expect(d.find((r) => r.builtin === 'lunch')!.breakSec).toBe(1800);
    expect(d.find((r) => r.builtin === 'tea')!.breakSec).toBe(300);
    expect(d.find((r) => r.builtin === 'dinner')!.enabled).toBe(false);
    for (const r of d) expect(validateReminder(r)).toBeNull();
  });

  it('maps any animation to one of the five phone scenes', () => {
    expect(MOBILE_ANIMATIONS.map(sceneKind)).toEqual([...MOBILE_ANIMATIONS]);
    expect(sceneKind('walk')).toBe('stretch');
    expect(sceneKind('nonsense')).toBe('stretch');
    for (const a of MOBILE_ANIMATIONS) expect(ANIM_LOOK[a].color).toMatch(/^#[0-9A-F]{6}$/);
  });
});
