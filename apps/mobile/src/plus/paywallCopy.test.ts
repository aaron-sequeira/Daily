import { describe, expect, it } from 'vitest';
import type { Offer } from './billing';
import { ctaLabel, day7Label, endDayLabel, finePrint, reminderDayLabel } from './paywallCopy';

const y: Offer = { plan: 'yearly', productId: 'plus_yearly', price: 29.99, priceString: '$29.99', perMonthString: '$2.50', trialDays: 7 };
const m: Offer = { plan: 'monthly', productId: 'plus_monthly', price: 3.99, priceString: '$3.99', perMonthString: '$3.99', trialDays: 7 };

describe('paywall copy', () => {
  it('offers the trial when Play does', () => {
    expect(ctaLabel(y)).toBe('Start 7-day free trial');
    expect(finePrint(y)).toBe('7 days free, then $29.99 a year. Cancel anytime in Google Play before day 7 and you won’t pay.');
    expect(day7Label(m)).toBe('$3.99 a month starts');
  });

  it('asks to subscribe, with the price, when there is no trial', () => {
    expect(ctaLabel({ ...m, trialDays: null })).toBe('Subscribe for $3.99 a month');
    expect(finePrint({ ...y, trialDays: null })).toBe('$29.99 a year, renews automatically. Cancel anytime in Google Play.');
  });

  it('has something sensible before prices load', () => {
    expect(ctaLabel(undefined)).toBe('Loading prices…');
    expect(finePrint(undefined)).toBe('');
  });

  it('derives the timeline days from the trial length', () => {
    expect(reminderDayLabel(y)).toBe('Day 5');
    expect(endDayLabel(y)).toBe('Day 7');
    expect(reminderDayLabel({ ...y, trialDays: 14 })).toBe('Day 12');
    expect(endDayLabel({ ...y, trialDays: 14 })).toBe('Day 14');
    expect(reminderDayLabel({ ...y, trialDays: null })).toBe('');
  });
});
