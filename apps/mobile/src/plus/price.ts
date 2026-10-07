import type { Offer } from './billing';

/** "$29.99 a year instead of $47.88". The second half is twelve monthly payments in the store's own currency; it is
 * left out when the currency is unknown, so a price is never built by editing a localized string. */
export function yearlyInsteadOf(monthly: Offer, yearly: Offer, locale?: string): string {
  const base = `${yearly.priceString} a year`;
  if (!monthly.currencyCode) return base;
  try {
    return `${base} instead of ${new Intl.NumberFormat(locale, { style: 'currency', currency: monthly.currencyCode }).format(monthly.price * 12)}`;
  } catch {
    return base;
  }
}
