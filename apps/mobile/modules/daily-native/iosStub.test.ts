import { describe, expect, it } from 'vitest';
import { iosStub } from './iosStub';

describe('iosStub', () => {
  it('never throws and reports nothing Android-only', async () => {
    for (const [name, fn] of Object.entries(iosStub)) {
      if (name === 'googleSignIn' || name === 'appInfo') continue;
      await Promise.resolve((fn as (...a: unknown[]) => unknown)(0, 0, '', ''));
    }
    expect(iosStub.hasUsageAccess()).toBe(false);
    expect(await iosStub.queryEvents(0, 1)).toEqual([]);
    expect(await iosStub.usageTotals(0, 1)).toEqual([]);
    expect(await iosStub.unlockCount(0, 1)).toBe(-1);
    expect(iosStub.canScheduleExactAlarms()).toBe(true);
    expect(iosStub.canDrawOverlays()).toBe(false);
    expect(iosStub.takeBubbleActions()).toEqual([]);
  });
  it('rejects Google sign-in with the failed code', async () => {
    await expect(iosStub.googleSignIn('x')).rejects.toMatchObject({ code: 'failed' });
  });
  it('labels unknown apps with their id', async () => {
    expect(await iosStub.appInfo(['a'])).toEqual([{ pkg: 'a', label: 'a', category: -1, icon: null }]);
  });
});
