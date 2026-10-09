/** Features that exist only on Android. iOS gets its own versions later: Screen Time in i2, the Island in i3. Pure, so tests can import it. */
export type Features = {
  usageAccess: boolean; sunnyChip: boolean; floatingSunny: boolean;
  keepRunningHelp: boolean; exactAlarms: boolean; googleSignIn: boolean;
};

export function features(os: string): Features {
  const a = os !== 'ios';
  return { usageAccess: a, sunnyChip: a, floatingSunny: a, keepRunningHelp: a, exactAlarms: a, googleSignIn: a };
}

export type Store = 'Google Play' | 'App Store';
export const storeName = (os: string): Store => (os === 'ios' ? 'App Store' : 'Google Play');
/** "in the App Store" / "in Google Play" for sentences. */
export const inStore = (os: string) => (os === 'ios' ? 'in the App Store' : 'in Google Play');
