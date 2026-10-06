import { builtinDefaults, type Reminder } from '@worksight/core/reminders';

export const MOBILE_ANIMATIONS = ['water', 'meal', 'tea', 'dinner', 'stretch'] as const;
export type MobileAnimation = typeof MOBILE_ANIMATIONS[number];

/** The phone draws five scenes; anything else (a desktop-only animation) uses stretch. */
export function sceneKind(a: string): MobileAnimation {
  return (MOBILE_ANIMATIONS as readonly string[]).includes(a) ? (a as MobileAnimation) : 'stretch';
}

/** Spec §9.1: the desktop's built-ins on weekdays, but tea is a 5-minute break on the phone. */
export function mobileDefaults(): Omit<Reminder, 'id'>[] {
  return builtinDefaults([1, 2, 3, 4, 5]).map((r) => (r.builtin === 'tea' ? { ...r, breakSec: 300 } : r));
}

export const ANIM_LOOK: Record<MobileAnimation, { label: string; color: string; icon: 'drop' | 'meal' | 'cup' | 'moon' | 'person'; breakTitle: string }> = {
  water: { label: 'Water', color: '#CFE6FB', icon: 'drop', breakTitle: 'Take a few sips' },
  meal: { label: 'Meal', color: '#BFEBD3', icon: 'meal', breakTitle: 'Time to eat' },
  tea: { label: 'Tea', color: '#F9DDB9', icon: 'cup', breakTitle: 'Put the kettle on' },
  dinner: { label: 'Dinner', color: '#F4C6C8', icon: 'moon', breakTitle: 'Dinner time' },
  stretch: { label: 'Stretch', color: '#D8D2FC', icon: 'person', breakTitle: 'Stand up and stretch' }
};
