import { NO_ENTITLEMENT, type Billing, type Entitlement, type Offer } from './billing';

const DAY = 86_400_000;

/** Debug builds without a RevenueCat key: fixed US prices and an instant 7-day trial. Never used in release builds. */
export function fakeBilling(): Billing {
  let current: Entitlement = NO_ENTITLEMENT;
  const listeners = new Set<(e: Entitlement) => void>();
  const set = (e: Entitlement) => { current = e; for (const l of listeners) l(e); return e; };
  const offers: Offer[] = [
    { plan: 'yearly', productId: 'plus_yearly', price: 29.99, priceString: '$29.99', perMonthString: '$2.50', currencyCode: 'USD', trialDays: 7 },
    { plan: 'monthly', productId: 'plus_monthly', price: 3.99, priceString: '$3.99', perMonthString: '$3.99', currencyCode: 'USD', trialDays: 7 }
  ];
  return {
    async start() {},
    async logIn() {},
    async offers() { return offers; },
    async purchase(plan) { return { ok: true, ent: set({ active: true, untilMs: Date.now() + 7 * DAY, plan, trial: true, willRenew: true }) }; },
    async restore() { return current; },
    async entitlement() { return current; },
    onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    manageUrl() { return 'https://play.google.com/store/account/subscriptions'; }
  };
}
