/** RevenueCat's public key for this platform's store; a Play key never reaches iOS (RevenueCat rejects it). */
export const revenueCatKey = (os: string, keys: { android?: string; ios?: string }) => (os === 'ios' ? keys.ios : keys.android) ?? '';

export const manageUrlFor = (os: string, plan: string | null) => os === 'ios'
  ? 'https://apps.apple.com/account/subscriptions'
  : `https://play.google.com/store/account/subscriptions?package=com.aaronalex.daily${plan ? `&sku=plus_${plan}` : ''}`;
