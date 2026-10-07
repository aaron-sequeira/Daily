import Purchases, { PURCHASES_ERROR_CODE, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { NO_ENTITLEMENT, purchaseMessage, toEntitlement, toOffer, type Billing, type Entitlement, type PlanId, type RcCustomerInfo, type RcPackage } from './billing';

const PACKAGE = 'com.aaronalex.daily';
const ent = (info: CustomerInfo): Entitlement => toEntitlement(info as unknown as RcCustomerInfo, Date.now());

export function revenueCatBilling(apiKey: string): Billing {
  let started = false;
  const packages = new Map<PlanId, PurchasesPackage>();
  const loadPackages = async () => {
    const current = (await Purchases.getOfferings()).current;
    packages.clear();
    for (const p of current?.availablePackages ?? []) {
      const o = toOffer(p as unknown as RcPackage);
      if (o) packages.set(o.plan, p);
    }
  };
  return {
    async start(userId) {
      if (started) return;
      Purchases.configure({ apiKey, appUserID: userId ?? undefined });
      started = true;
    },
    async logIn(userId) { if (started) await Purchases.logIn(userId); },
    async offers() {
      await loadPackages();
      return [...packages.values()].map((p) => toOffer(p as unknown as RcPackage)!).sort((a) => (a.plan === 'yearly' ? -1 : 1));
    },
    async purchase(plan) {
      try {
        if (!packages.size) await loadPackages();
        const pkg = packages.get(plan);
        if (!pkg) return { ok: false, cancelled: false, message: purchaseMessage(null) };
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        return { ok: true, ent: ent(customerInfo) };
      } catch (e) {
        const err = e as { userCancelled?: boolean; code?: string };
        if (err.userCancelled || err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return { ok: false, cancelled: true, message: '' };
        return { ok: false, cancelled: false, message: purchaseMessage(err.code ?? null) };
      }
    },
    async restore() { return ent(await Purchases.restorePurchases()); },
    async entitlement() { return started ? ent(await Purchases.getCustomerInfo()) : NO_ENTITLEMENT; },
    onChange(cb) {
      const listener = (info: CustomerInfo) => cb(ent(info));
      Purchases.addCustomerInfoUpdateListener(listener);
      return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
    },
    manageUrl(plan) {
      return `https://play.google.com/store/account/subscriptions?package=${PACKAGE}${plan ? `&sku=plus_${plan}` : ''}`;
    }
  };
}
