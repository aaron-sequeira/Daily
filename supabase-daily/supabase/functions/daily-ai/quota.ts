import type { AiRequest } from './contract.ts';
import { service, type Rest } from './supabase-rest.ts';

/** Spec §11: 1 automatic report + 3 rewrites a day; 1 week sentence + 2 rewrites a week. */
export const LIMITS = { auto: 1, rewrite: 3, weekAuto: 1, weekRewrite: 2 } as const;

export type Quota = { use(userId: string, bucket: string, limit: number): Promise<boolean>; refund(userId: string, bucket: string): Promise<void> };

/** Automatic writes are counted per report day/week (yesterday's late write doesn't eat today's); rewrites per calendar day. */
export function bucketFor(r: AiRequest, utcDay: string): { bucket: string; limit: number } {
  if (r.kind === 'week') return r.mode === 'auto' ? { bucket: `week:${r.input.weekStart}`, limit: LIMITS.weekAuto } : { bucket: `week-rewrite:${r.input.weekStart}`, limit: LIMITS.weekRewrite };
  return r.mode === 'auto' ? { bucket: `report:${r.input.day}`, limit: LIMITS.auto } : { bucket: `rewrite:${utcDay}`, limit: LIMITS.rewrite };
}

export function makeQuota(r: Rest): Quota {
  const rpc = async (fn: string, body: unknown) => r.fetchFn(`${r.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: service(r), body: JSON.stringify(body) });
  return {
    async use(userId, bucket, limit) {
      try {
        const res = await rpc('use_ai', { p_user: userId, p_bucket: bucket, p_limit: limit });
        return res.ok && (await res.json()) === true;
      } catch {
        return false;
      }
    },
    async refund(userId, bucket) {
      await rpc('refund_ai', { p_user: userId, p_bucket: bucket }).catch(() => {});
    }
  };
}
