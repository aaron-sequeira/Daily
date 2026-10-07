import type { AiRequest } from './contract.ts';
import { service, timeout, type Rest } from './supabase-rest.ts';

/** Spec §11: 1 automatic report + 3 rewrites a day; 1 week sentence + 2 rewrites a week. An automatic report gets a
 * second slot, so a lost response or an outage day can't leave that day's story stuck on 'limit' (DAILY_CEILING still bounds it). */
export const LIMITS = { auto: 2, rewrite: 3, weekAuto: 1, weekRewrite: 2 } as const;

export type Quota = { use(userId: string, bucket: string, limit: number): Promise<'yes' | 'no' | 'error'>; refund(userId: string, bucket: string): Promise<void> };

/** Per user per UTC day, across every kind of request. Taken first and never refunded, so refund loops cannot spend without end. */
export const DAILY_CEILING = 12;

const DAY_MS = 86_400_000;
/** The UTC day as a number of days, or null when `day` is not a real calendar date. */
function dayNumber(day: string): number | null {
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day ? null : Math.round(t / DAY_MS);
}

/** The quota key comes from a date the client picks, so only dates a real client would send get a key. */
export function requestAllowed(r: AiRequest, utcDay: string): boolean {
  const today = dayNumber(utcDay);
  if (today === null) return false;
  if (r.kind === 'report') {
    const d = dayNumber(r.input.day);
    if (d === null || d > today + 1) return false;
    // Rewrites may reach any past day (their bucket is keyed by today, not by the day); automatic writes only the recent ones.
    return d >= today - (r.mode === 'rewrite' ? 400 : 2);
  }
  const w = dayNumber(r.input.weekStart);
  return w !== null && today - w >= 6 && today - w <= 400;
}

/** Automatic writes are counted per report day/week (yesterday's late write doesn't eat today's); rewrites per calendar day. */
export function bucketFor(r: AiRequest, utcDay: string): { bucket: string; limit: number } {
  if (r.kind === 'week') return r.mode === 'auto' ? { bucket: `week:${r.input.weekStart}`, limit: LIMITS.weekAuto } : { bucket: `week-rewrite:${r.input.weekStart}`, limit: LIMITS.weekRewrite };
  return r.mode === 'auto' ? { bucket: `report:${r.input.day}`, limit: LIMITS.auto } : { bucket: `rewrite:${utcDay}`, limit: LIMITS.rewrite };
}

export function makeQuota(r: Rest): Quota {
  const rpc = async (fn: string, body: unknown) => r.fetchFn(`${r.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: service(r), body: JSON.stringify(body), signal: timeout() });
  return {
    async use(userId, bucket, limit) {
      try {
        const res = await rpc('use_ai', { p_user: userId, p_bucket: bucket, p_limit: limit });
        if (!res.ok) {
          console.warn('daily-ai: use_ai returned', res.status);
          return 'error';
        }
        return (await res.json()) === true ? 'yes' : 'no';
      } catch (e) {
        console.warn('daily-ai: use_ai failed:', e instanceof Error ? e.message : 'unknown');
        return 'error';
      }
    },
    async refund(userId, bucket) {
      try {
        const res = await rpc('refund_ai', { p_user: userId, p_bucket: bucket });
        if (!res.ok) console.warn('daily-ai: refund_ai returned', res.status);
      } catch (e) {
        console.warn('daily-ai: refund_ai failed:', e instanceof Error ? e.message : 'unknown');
      }
    }
  };
}
