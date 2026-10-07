import { describe, expect, it } from 'vitest';
import type { Offer } from './billing';
import { yearlyInsteadOf } from './price';

const offer = (plan: 'monthly' | 'yearly', price: number, priceString: string, currencyCode: string | null): Offer => ({ plan, productId: `plus_${plan}`, price, priceString, perMonthString: '', currencyCode, trialDays: 7 });

describe('yearlyInsteadOf', () => {
  const yearly = offer('yearly', 29.99, '$29.99', 'USD');
  it('shows the store yearly price, then twelve months formatted in the store currency', () => {
    expect(yearlyInsteadOf(offer('monthly', 3.99, '$3.99', 'USD'), yearly, 'en-US')).toBe('$29.99 a year instead of $47.88');
    expect(yearlyInsteadOf(offer('monthly', 400, '¥400', 'JPY'), offer('yearly', 3000, '¥3,000', 'JPY'), 'en-US')).toBe('¥3,000 a year instead of ¥4,800');
    expect(yearlyInsteadOf(offer('monthly', 3.99, '3,99 €', 'EUR'), offer('yearly', 29.99, '29,99 €', 'EUR'), 'de-DE')).toBe('29,99 € a year instead of 47,88 €');
  });
  it('drops the second half when the currency is missing or invalid', () => {
    expect(yearlyInsteadOf(offer('monthly', 3.99, '$3.99', null), yearly)).toBe('$29.99 a year');
    expect(yearlyInsteadOf(offer('monthly', 3.99, '$3.99', 'not-a-code'), yearly)).toBe('$29.99 a year');
  });
});
