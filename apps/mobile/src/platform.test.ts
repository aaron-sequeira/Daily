import { describe, expect, it } from 'vitest';
import { features, inStore, storeName } from './platform';

describe('platform', () => {
  it('turns every Android-only feature on for android', () => {
    const { screenTime, ...android } = features('android');
    expect(Object.values(android).every(Boolean)).toBe(true);
    expect(screenTime).toBe(false);
  });
  it('turns every Android-only feature off for ios', () => {
    const { screenTime, ...ios } = features('ios');
    expect(Object.values(ios).some(Boolean)).toBe(false);
    expect(screenTime).toBe(true);
  });
  it('names the store', () => {
    expect(storeName('android')).toBe('Google Play');
    expect(storeName('ios')).toBe('App Store');
    expect(inStore('ios')).toBe('in the App Store');
    expect(inStore('android')).toBe('in Google Play');
  });
});
