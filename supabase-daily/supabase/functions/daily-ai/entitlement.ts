import { service, timeout, type Rest } from './supabase-rest.ts';

export const ENTITLEMENT_TTL_MS = 10 * 60_000;
const REVENUECAT = 'https://api.revenuecat.com/v1/subscribers/';

type Row = { plus: boolean; expires_at: string | null; checked_at: string };
const activeAt = (plus: boolean, expires: string | null, now: number) => plus && (expires === null || Date.parse(expires) > now);

/** Spec §11 step 2: RevenueCat decides; its answer is cached for 10 minutes in `entitlements`. */
export function makeIsPlus(r: Rest, rcSecret: string, now: () => number = Date.now) {
  return async (userId: string): Promise<'yes' | 'no' | 'error'> => {
    const t = now();
    let row: Row | null = null;
    try {
      const res = await r.fetchFn(`${r.url}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(userId)}&select=plus,expires_at,checked_at`, { headers: service(r), signal: timeout() });
      if (res.ok) row = ((await res.json()) as Row[])[0] ?? null;
    } catch { /* cache unreachable: ask RevenueCat */ }
    if (row && t - Date.parse(row.checked_at) < ENTITLEMENT_TTL_MS) return activeAt(row.plus, row.expires_at, t) ? 'yes' : 'no';

    try {
      const res = await r.fetchFn(REVENUECAT + encodeURIComponent(userId), { headers: { authorization: `Bearer ${rcSecret}` }, signal: timeout() });
      if (!res.ok) throw new Error(`revenuecat ${res.status}`);
      const ent = ((await res.json()) as { subscriber?: { entitlements?: Record<string, { expires_date?: string | null; grace_period_expires_date?: string | null }> } })
        .subscriber?.entitlements?.plus;
      // Lifetime only when expires_date itself is null; otherwise the later of expiry and grace.
      const until = !ent || ent.expires_date == null ? null : [ent.expires_date, ent.grace_period_expires_date].filter((d): d is string => !!d).reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
      const plus = !!ent && (until === null || Date.parse(until) > t);
      await r.fetchFn(`${r.url}/rest/v1/entitlements`, {
        method: 'POST',
        headers: { ...service(r), prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: userId, plus, expires_at: until, checked_at: new Date(t).toISOString() }),
        signal: timeout()
      }).then((w) => { if (!w.ok) console.warn('daily-ai: entitlement cache write returned', w.status); }).catch(() => {});
      return plus ? 'yes' : 'no';
    } catch (e) {
      console.warn('daily-ai: entitlement check failed:', e instanceof Error ? e.message : 'unknown');
      return row ? (activeAt(row.plus, row.expires_at, t) ? 'yes' : 'no') : 'error';
    }
  };
}
