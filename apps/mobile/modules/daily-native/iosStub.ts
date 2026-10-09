import type { DailyNativeApi } from './types';

const noop = () => {};
/** iOS has no Kotlin module: everything answers "not here" and never throws. Screen Time replaces it in i2. */
export const iosStub: DailyNativeApi = {
  packageName: () => 'com.aaronalex.daily',
  hasUsageAccess: () => false,
  openUsageAccessSettings: noop,
  defaultLauncher: () => null,
  queryEvents: async () => [],
  appInfo: async (pkgs) => pkgs.map((pkg) => ({ pkg, label: pkg, category: -1, icon: null })),
  usageTotals: async () => [],
  unlockCount: async () => -1,
  canScheduleExactAlarms: () => true, // iOS delivers scheduled notifications on time; nothing to grant
  isInCall: () => false,
  openExactAlarmSettings: noop,
  startSunnyService: noop,
  stopSunnyService: noop,
  updateChip: noop,
  openBatterySettings: noop,
  canDrawOverlays: () => false,
  openOverlaySettings: noop,
  updateBubble: noop,
  showBubbleSpeech: noop,
  takeBubbleActions: () => [],
  bubbleHiddenDay: () => null,
  googleSignIn: async () => { throw Object.assign(new Error('Google sign-in isn’t on iPhone yet'), { code: 'failed' }); }
};
