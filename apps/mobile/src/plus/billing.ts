export type PlanId = 'monthly' | 'yearly';
export type Offer = { plan: PlanId; productId: string; price: number; priceString: string; perMonthString: string; trialDays: number | null };
export type Entitlement = { active: boolean; untilMs: number | null; plan: PlanId | null; trial: boolean; willRenew: boolean };
export type PurchaseResult = { ok: true; ent: Entitlement } | { ok: false; cancelled: boolean; message: string };

export interface Billing {
  start(): Promise<void>;
  logIn(userId: string): Promise<void>;
  offers(): Promise<Offer[]>;
  purchase(plan: PlanId): Promise<PurchaseResult>;
  restore(): Promise<Entitlement>;
  entitlement(): Promise<Entitlement>;
  onChange(cb: (e: Entitlement) => void): () => void;
  manageUrl(plan: PlanId | null): string;
}

export const ENTITLEMENT_ID = 'plus';
export const NO_ENTITLEMENT: Entitlement = { active: false, untilMs: null, plan: null, trial: false, willRenew: false };

/** The subset of RevenueCat's CustomerInfo and Package we read. */
export type RcCustomerInfo = { entitlements: { active: Record<string, { isActive?: boolean; expirationDate?: string | null; periodType?: string; willRenew?: boolean; productIdentifier?: string } | undefined> } };
export type RcPackage = { packageType: string; product: { identifier: string; price: number; priceString: string; pricePerMonthString?: string | null; defaultOption?: { freePhase?: { billingPeriod?: { unit?: string; value?: number } } | null } | null } };

const planOf = (productId: string | undefined): PlanId | null => (productId?.includes('yearly') ? 'yearly' : productId?.includes('monthly') ? 'monthly' : null);

export function toEntitlement(info: RcCustomerInfo, nowMs: number): Entitlement {
  const e = info.entitlements.active[ENTITLEMENT_ID];
  if (!e) return NO_ENTITLEMENT;
  const untilMs = e.expirationDate ? Date.parse(e.expirationDate) : null;
  if (untilMs !== null && untilMs <= nowMs) return NO_ENTITLEMENT;
  return { active: true, untilMs, plan: planOf(e.productIdentifier), trial: e.periodType === 'TRIAL', willRenew: !!e.willRenew };
}

export function toOffer(pkg: RcPackage): Offer | null {
  const plan: PlanId | null = pkg.packageType === 'ANNUAL' ? 'yearly' : pkg.packageType === 'MONTHLY' ? 'monthly' : null;
  if (!plan) return null;
  const free = pkg.product.defaultOption?.freePhase?.billingPeriod;
  const unitDays: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30 };
  const days = free?.value && free.unit && unitDays[free.unit] ? free.value * unitDays[free.unit] : null;
  return {
    plan, productId: pkg.product.identifier, price: pkg.product.price, priceString: pkg.product.priceString,
    perMonthString: pkg.product.pricePerMonthString ?? (plan === 'yearly' ? '' : pkg.product.priceString), trialDays: days
  };
}

export function savePercent(offers: Offer[]): number | null {
  const m = offers.find((o) => o.plan === 'monthly');
  const y = offers.find((o) => o.plan === 'yearly');
  return m && y && m.price > 0 ? Math.round((1 - y.price / (m.price * 12)) * 100) : null;
}

const MESSAGES: Record<string, string> = {
  PAYMENT_PENDING_ERROR: 'Your payment is pending. Plus turns on when it clears.',
  NETWORK_ERROR: 'Couldn’t reach Google Play. Check your connection and try again.',
  OFFLINE_CONNECTION_ERROR: 'Couldn’t reach Google Play. Check your connection and try again.',
  PRODUCT_ALREADY_PURCHASED_ERROR: 'You already have Daily Plus. Tap Restore purchases.',
  STORE_PROBLEM_ERROR: 'Google Play had a problem. Try again in a moment.',
  PURCHASE_NOT_ALLOWED_ERROR: 'Purchases aren’t allowed on this device or account.',
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: 'Daily Plus isn’t available in your country yet.'
};

/** The SDK reports numeric string codes ('20'); this finds the enum name they stand for. */
export function errorName(code: string | null, codes: Record<string, string>): string | null {
  return code === null ? null : Object.keys(codes).find((k) => codes[k] === code) ?? null;
}

/** Spec §13: one line, never alarming; a cancelled purchase shows nothing (the caller checks `cancelled`). */
export function purchaseMessage(code: string | null): string {
  return (code && MESSAGES[code]) || 'Something went wrong. You haven’t been charged.';
}
