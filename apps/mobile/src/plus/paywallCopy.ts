import type { Offer } from './billing';

const per = (o: Offer) => (o.plan === 'yearly' ? 'a year' : 'a month');

export function ctaLabel(o: Offer | undefined): string {
  if (!o) return 'Loading prices…';
  return o.trialDays ? `Start ${o.trialDays}-day free trial` : `Subscribe for ${o.priceString} ${per(o)}`;
}

export function finePrint(o: Offer | undefined): string {
  if (!o) return '';
  return o.trialDays
    ? `${o.trialDays} days free, then ${o.priceString} ${per(o)}. Cancel anytime in Google Play before day ${o.trialDays} and you won’t pay.`
    : `${o.priceString} ${per(o)}, renews automatically. Cancel anytime in Google Play.`;
}

export function day7Label(o: Offer | undefined): string {
  return o ? `${o.priceString} ${per(o)} starts` : '';
}

export function reminderDayLabel(o: Offer | undefined): string {
  return o?.trialDays ? `Day ${Math.max(1, o.trialDays - 2)}` : '';
}

export function endDayLabel(o: Offer | undefined): string {
  return o?.trialDays ? `Day ${o.trialDays}` : '';
}
