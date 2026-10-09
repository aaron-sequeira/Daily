import { inStore } from '../platform';
import { OS } from '../platformNow';
import type { Offer } from './billing';

const per = (o: Offer) => (o.plan === 'yearly' ? 'a year' : 'a month');

/** 'owned': a subscriber sees no buy button. 'change': only the switch to yearly (Your subscription → Switch to yearly). */
export type PaywallMode = 'buy' | 'owned' | 'change';
export function paywallMode(plus: boolean, change: string | string[] | undefined): PaywallMode {
  if (!plus) return 'buy';
  return change === 'yearly' ? 'change' : 'owned';
}

export function ctaLabel(o: Offer | undefined): string {
  if (!o) return 'Loading prices…';
  return o.trialDays ? `Start ${o.trialDays}-day free trial` : `Subscribe for ${o.priceString} ${per(o)}`;
}

export function finePrint(o: Offer | undefined, os: string = OS): string {
  if (!o) return '';
  return o.trialDays
    ? `${o.trialDays} days free, then ${o.priceString} ${per(o)}. Cancel anytime ${inStore(os)} before day ${o.trialDays} and you won’t pay.`
    : `${o.priceString} ${per(o)}, renews automatically. Cancel anytime ${inStore(os)}.`;
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
