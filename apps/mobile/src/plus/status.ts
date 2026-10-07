import type { Db } from '../db/db';
import { getNumber, getSetting, setSetting } from '../db/settings';
import type { PlanId } from './billing';
import { isPlus } from './plus';

const DAY = 86_400_000;
const TRIAL_DAYS = 7;
export const REWRITES_PER_DAY = 3; // spec §11; the server enforces it, this only shows it
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The server counts rewrites per UTC day (quota.ts), so the pips must too. */
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const date = (ms: number) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export type PlusStatus = { title: string; sub: string; trialDay: number | null; trialDays: number; plan: PlanId | null; monthly: boolean };

export function plusStatus(db: Db, nowMs: number): PlusStatus | null {
  if (!isPlus(db, nowMs)) return null;
  const until = getNumber(db, 'plus_until');
  const plan = (getSetting(db, 'plus_plan') || null) as PlanId | null;
  const name = plan === 'monthly' ? 'Monthly' : 'Yearly';
  if (getSetting(db, 'plus_trial') === '1' && until > nowMs) {
    const day = Math.min(TRIAL_DAYS, Math.max(1, TRIAL_DAYS - Math.ceil((until - nowMs) / DAY) + 1));
    return { title: 'Your free week', sub: `Day ${day} of ${TRIAL_DAYS} · ${name} plan`, trialDay: day, trialDays: TRIAL_DAYS, plan, monthly: plan === 'monthly' };
  }
  // Lifetime (-1), or Plus only through the developer switch (nothing cached, or a stale cache): no date to show.
  const when = until <= nowMs ? '' : ` · ${getSetting(db, 'plus_renews') === '1' ? 'renews' : 'ends'} ${date(until)}`;
  return { title: 'You’re on Daily Plus', sub: `${name}${when}`, trialDay: null, trialDays: TRIAL_DAYS, plan, monthly: plan === 'monthly' };
}

export function rewritesLeft(db: Db, nowMs: number): number {
  const [day, n] = getSetting(db, 'rewrites_today').split('|');
  return day === utcDay(nowMs) ? Math.max(0, REWRITES_PER_DAY - Number(n || 0)) : REWRITES_PER_DAY;
}

export function noteRewrite(db: Db, nowMs: number): void {
  setSetting(db, 'rewrites_today', `${utcDay(nowMs)}|${Math.min(REWRITES_PER_DAY, REWRITES_PER_DAY - rewritesLeft(db, nowMs) + 1)}`);
}

/** The server said the day's limit is reached, so show it as used up. */
export function noteRewriteLimit(db: Db, nowMs: number): void {
  setSetting(db, 'rewrites_today', `${utcDay(nowMs)}|${REWRITES_PER_DAY}`);
}
