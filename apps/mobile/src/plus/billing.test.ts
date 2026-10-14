import { manageUrlFor, revenueCatKey } from './store';
import { describe, expect, it } from 'vitest';
import { changeFor, errorName, purchaseMessage, savePercent, toEntitlement, toOffer, type Offer } from './billing';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const offer = (plan: 'monthly' | 'yearly', price: number): Offer => ({ plan, productId: `plus_${plan}`, price, priceString: `$${price}`, perMonthString: '', currencyCode: 'USD', trialDays: 7 });

describe('billing helpers', () => {
  it('computes the yearly saving from the two prices', () => {
    expect(savePercent([offer('monthly', 3.99), offer('yearly', 29.99)])).toBe(37);
    expect(savePercent([offer('yearly', 29.99)])).toBeNull();
  });

  it('reads RevenueCat customer info into an entitlement', () => {
    const info = { entitlements: { active: { plus: { isActive: true, expirationDate: '2026-10-15T12:00:00Z', periodType: 'TRIAL', willRenew: true, productIdentifier: 'plus_yearly:yearly' } } } };
    expect(toEntitlement(info, NOW)).toEqual({ active: true, untilMs: Date.parse('2026-10-15T12:00:00Z'), plan: 'yearly', trial: true, willRenew: true });
    expect(toEntitlement({ entitlements: { active: {} } }, NOW)).toEqual({ active: false, untilMs: null, plan: null, trial: false, willRenew: false });
    const lapsed = { entitlements: { active: { plus: { isActive: true, expirationDate: '2026-10-01T00:00:00Z', periodType: 'NORMAL', willRenew: false, productIdentifier: 'plus_monthly' } } } };
    expect(toEntitlement(lapsed, NOW).active).toBe(false); // Review Focus 4
  });

  it('reads a package into an offer, with the trial only when Play offers one', () => {
    const pkg = (id: string, freePhase: { billingPeriod?: { unit?: string; value?: number } } | null) => ({ packageType: id === 'plus_yearly' ? 'ANNUAL' : 'MONTHLY', product: { identifier: id, price: id === 'plus_yearly' ? 29.99 : 3.99, priceString: id === 'plus_yearly' ? '$29.99' : '$3.99', currencyCode: 'USD', pricePerMonthString: id === 'plus_yearly' ? '$2.50' : '$3.99', defaultOption: { freePhase } } });
    expect(toOffer(pkg('plus_yearly', { billingPeriod: { unit: 'DAY', value: 7 } }))).toEqual({ plan: 'yearly', productId: 'plus_yearly', price: 29.99, priceString: '$29.99', perMonthString: '$2.50', currencyCode: 'USD', trialDays: 7 });
    expect(toOffer({ packageType: 'MONTHLY', product: { identifier: 'plus_monthly', price: 3.99, priceString: '$3.99', defaultOption: null } })!.currencyCode).toBeNull();
    // App Store: the free trial comes as an introductory price of 0
    const ios = { packageType: 'ANNUAL', product: { identifier: 'plus_yearly', price: 29.99, priceString: '$29.99', introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 } } };
    expect(toOffer(ios)!.trialDays).toBe(7);
    expect(toOffer({ ...ios, product: { ...ios.product, introPrice: { price: 0.99, periodUnit: 'MONTH', periodNumberOfUnits: 1 } } })!.trialDays).toBeNull();
    expect(toOffer(pkg('plus_monthly', null))!.trialDays).toBeNull();
    expect(toOffer({ packageType: 'LIFETIME', product: { identifier: 'x', price: 1, priceString: '$1', defaultOption: null } })).toBeNull();
  });

  it('leaves the yearly per-month blank rather than echoing the yearly price, and gives no trial for year/unknown units', () => {
    const p = (unit: string) => ({ packageType: 'ANNUAL', product: { identifier: 'plus_yearly', price: 29.99, priceString: '$29.99', pricePerMonthString: null, defaultOption: { freePhase: { billingPeriod: { unit, value: 1 } } } } });
    expect(toOffer(p('DAY'))!.perMonthString).toBe('');
    expect(toOffer(p('YEAR'))!.trialDays).toBeNull();
    expect(toOffer(p('UNKNOWN'))!.trialDays).toBeNull();
  });

  it('maps the SDK numeric error code back to its name (Review Focus 1)', () => {
    const codes = { PAYMENT_PENDING_ERROR: '20', NETWORK_ERROR: '10' };
    expect(purchaseMessage(errorName('20', codes))).toBe('Your payment is pending. Plus turns on when it clears.');
    expect(purchaseMessage(errorName('10', codes))).toBe('Couldn’t reach Google Play. Check your connection and try again.');
    expect(errorName('99', codes)).toBeNull();
    expect(errorName(null, codes)).toBeNull();
    expect(purchaseMessage(errorName('99', codes))).toBe('Something went wrong. You haven’t been charged.');
  });

  it('never starts a second subscription: buys, does nothing, or changes plan', () => {
    expect(changeFor(null, 'yearly')).toEqual({ action: 'buy' });
    expect(changeFor(null, 'monthly')).toEqual({ action: 'buy' });
    expect(changeFor('plus_yearly', 'yearly')).toEqual({ action: 'none' });
    expect(changeFor('plus_yearly:yearly', 'yearly')).toEqual({ action: 'none' });
    expect(changeFor('plus_monthly:monthly', 'monthly')).toEqual({ action: 'none' });
    expect(changeFor('plus_monthly', 'yearly')).toEqual({ action: 'change', oldProductId: 'plus_monthly' });
    expect(changeFor('plus_monthly:monthly', 'yearly')).toEqual({ action: 'change', oldProductId: 'plus_monthly' });
    expect(changeFor('plus_yearly:yearly', 'monthly')).toEqual({ action: 'change', oldProductId: 'plus_yearly' });
  });

  it('says one calm line per purchase problem (spec §13; Review Focus 1)', () => {
    expect(purchaseMessage('PAYMENT_PENDING_ERROR')).toBe('Your payment is pending. Plus turns on when it clears.');
    expect(purchaseMessage('NETWORK_ERROR')).toBe('Couldn’t reach Google Play. Check your connection and try again.');
    expect(purchaseMessage('PRODUCT_ALREADY_PURCHASED_ERROR')).toBe('You already have Daily Plus. Tap Restore purchases.');
    expect(purchaseMessage('STORE_PROBLEM_ERROR')).toBe('Google Play had a problem. Try again in a moment.');
    expect(purchaseMessage(null)).toBe('Something went wrong. You haven’t been charged.');
  });
});

describe('store per platform', () => {
  it('picks the RevenueCat key for the platform and never crosses stores', () => {
    const env = { android: 'goog_x', ios: 'appl_y' };
    expect(revenueCatKey('android', env)).toBe('goog_x');
    expect(revenueCatKey('ios', env)).toBe('appl_y');
    expect(revenueCatKey('ios', { android: 'goog_x' })).toBe('');
  });
  it('manages the subscription in the right store', () => {
    expect(manageUrlFor('ios', 'monthly')).toBe('https://apps.apple.com/account/subscriptions');
    expect(manageUrlFor('android', 'monthly')).toBe('https://play.google.com/store/account/subscriptions?package=com.aaronalex.daily&sku=plus_monthly');
  });
  it('names the App Store in errors on iPhone', () => {
    expect(purchaseMessage('NETWORK_ERROR', 'ios')).toBe('Couldn’t reach the App Store. Check your connection and try again.');
  });
});
