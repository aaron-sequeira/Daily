import { describe, expect, it, vi } from 'vitest';
import { bucketFor, LIMITS, makeQuota } from '../supabase/functions/daily-ai/quota.ts';
import sample from './sample-request.json';

describe('quota', () => {
  it('calls the use_ai and refund_ai functions with the service key', async () => {
    const fetchFn = vi.fn(async () => new Response('true', { status: 200 }));
    const q = makeQuota({ url: 'https://p.supabase.co', anonKey: 'anon', serviceKey: 'service', fetchFn });
    expect(await q.use('u1', 'report:2026-10-06', 1)).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p.supabase.co/rest/v1/rpc/use_ai');
    expect(JSON.parse(String(init.body))).toEqual({ p_user: 'u1', p_bucket: 'report:2026-10-06', p_limit: 1 });
    expect(init.headers).toMatchObject({ apikey: 'service', authorization: 'Bearer service' });
    await q.refund('u1', 'report:2026-10-06');
    expect((fetchFn.mock.calls[1] as unknown as [string])[0]).toBe('https://p.supabase.co/rest/v1/rpc/refund_ai');
  });

  it('says no when the database says no or is unreachable', async () => {
    expect(await makeQuota({ url: 'u', anonKey: 'a', serviceKey: 's', fetchFn: async () => new Response('false') }).use('u1', 'b', 1)).toBe(false);
    expect(await makeQuota({ url: 'u', anonKey: 'a', serviceKey: 's', fetchFn: async () => { throw new Error('down'); } }).use('u1', 'b', 1)).toBe(false);
  });

  it('keys buckets by the report day or week (spec §11 limits)', () => {
    const report = { ...(sample as never as { kind: 'report'; input: { day: string } }), mode: 'auto' as const };
    expect(bucketFor(report as never, '2026-10-07')).toEqual({ bucket: 'report:2026-10-06', limit: LIMITS.auto });
    expect(bucketFor({ ...report, mode: 'rewrite' } as never, '2026-10-07')).toEqual({ bucket: 'rewrite:2026-10-07', limit: LIMITS.rewrite });
    const week = { kind: 'week', mode: 'auto', input: { weekStart: '2026-09-28' } };
    expect(bucketFor(week as never, '2026-10-07')).toEqual({ bucket: 'week:2026-09-28', limit: LIMITS.weekAuto });
    expect(bucketFor({ ...week, mode: 'rewrite' } as never, '2026-10-07')).toEqual({ bucket: 'week-rewrite:2026-09-28', limit: LIMITS.weekRewrite });
  });
});
