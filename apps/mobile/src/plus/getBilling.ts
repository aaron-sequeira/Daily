import type { Billing } from './billing';
import { fakeBilling } from './fakeBilling';
import { revenueCatBilling } from './revenuecat';

let billing: Billing | undefined;
/** RevenueCat with the public Android key from apps/mobile/.env; the fake in debug builds without one; else nothing to buy. */
export function getBilling(): Billing {
  if (!billing) {
    const key = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
    billing = key ? revenueCatBilling(key) : __DEV__ ? fakeBilling() : { ...fakeBilling(), offers: async () => [] };
  }
  return billing;
}
