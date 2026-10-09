import { NO_ENTITLEMENT, purchaseMessage, type Billing } from './billing';
import { fakeBilling } from './fakeBilling';
import { OS } from '../platformNow';
import { revenueCatBilling } from './revenuecat';
import { revenueCatKey } from './store';

let billing: Billing | undefined;
/** RevenueCat with this platform's public key (apps/mobile/.env, eas.json); the fake in debug builds without one; else nothing to buy. */
export function getBilling(): Billing {
  if (!billing) {
    // Expo inlines only literal process.env.EXPO_PUBLIC_* reads.
    const key = revenueCatKey(OS, { android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY, ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY });
    billing = key ? revenueCatBilling(key) : __DEV__ ? fakeBilling() : {
      ...fakeBilling(),
      offers: async () => [],
      purchase: async () => ({ ok: false, cancelled: false, message: purchaseMessage(null) }),
      restore: async () => NO_ENTITLEMENT
    };
  }
  return billing;
}
