import { describe, expect, it } from 'vitest';
import { features, inStore, storeName } from './platform';

describe('platform', () => {
  it('turns every Android-only feature on for android', () => {
    expect(Object.values(features('android')).every(Boolean)).toBe(true);
  });
  it('turns every Android-only feature off for ios', () => {
    expect(Object.values(features('ios')).some(Boolean)).toBe(false);
  });
  it('names the store', () => {
    expect(storeName('android')).toBe('Google Play');
    expect(storeName('ios')).toBe('App Store');
    expect(inStore('ios')).toBe('in the App Store');
    expect(inStore('android')).toBe('in Google Play');
  });
});
