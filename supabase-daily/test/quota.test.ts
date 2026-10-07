import { describe, expect, it, vi } from 'vitest';
import { bucketFor, LIMITS, makeQuota, requestAllowed } from '../supabase/functions/daily-ai/quota.ts';
import sample from './sample-request.json';

describe('quota', () => {
  it('calls the use_ai and refund_ai functions with the service key', async () => {
    const fetchFn = vi.fn(async () => new Response('true', { status: 200 }));
    const q = makeQuota({ url: 'https://p.supabase.co', anonKey: 'anon', serviceKey: 'service', fetchFn });
    expect(await q.use('u1', 'report:2026-10-06', 1)).toBe('yes');
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p.supabase.co/rest/v1/rpc/use_ai');
    expect(JSON.parse(String(init.body))).toEqual({ p_user: 'u1', p_bucket: 'report:2026-10-06', p_limit: 1 });
    expect(init.headers).toMatchObject({ apikey: 'service', authorization: 'Bearer service' });
    await q.refund('u1', 'report:2026-10-06');
    expect((fetchFn.mock.calls[1] as unknown as [string])[0]).toBe('https://p.supabase.co/rest/v1/rpc/refund_ai');
  });

  it('says no when the database says no, and error when it is down or not OK', async () => {
    const mk = (fetchFn: () => Promise<Response>) => makeQuota({ url: 'u', anonKey: 'a', serviceKey: 's', fetchFn });
    expect(await mk(async () => new Response('false')).use('u1', 'b', 1)).toBe('no');
    expect(await mk(async () => { throw new Error('down'); }).use('u1', 'b', 1)).toBe('error');
    expect(await mk(async () => new Response('oops', { status: 500 })).use('u1', 'b', 1)).toBe('error');
  });

  it('logs only the status when a refund is not OK', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await makeQuota({ url: 'u', anonKey: 'a', serviceKey: 'SECRET', fetchFn: async () => new Response('body', { status: 500 }) }).refund('u1', 'b');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain('500');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
    warn.mockRestore();
  });

  it('only allows dates a real client would send (the quota key must not be client-chosen)', () => {
    const report = (day: string) => ({ kind: 'report', mode: 'auto', input: { day } }) as never;
    const week = (weekStart: string) => ({ kind: 'week', mode: 'auto', input: { weekStart } }) as never;
    const today = '2026-10-07';
    expect(requestAllowed(report('2026-10-06'), today)).toBe(true);
    expect(requestAllowed(report('2026-10-05'), today)).toBe(true);
    expect(requestAllowed(report('2026-10-08'), today)).toBe(true);
    expect(requestAllowed(report('2026-10-04'), today)).toBe(false);
    expect(requestAllowed(report('2026-10-09'), today)).toBe(false);
    expect(requestAllowed(report('2026-02-30'), today)).toBe(false);
    expect(requestAllowed(week('2026-10-04'), today)).toBe(false); // started 3 days ago: not finished
    expect(requestAllowed(week('2026-10-01'), today)).toBe(true); // 6 days
    expect(requestAllowed(week('2026-09-27'), today)).toBe(true); // 10 days
    expect(requestAllowed(week('2025-08-01'), today)).toBe(false); // over 400 days
    expect(requestAllowed(week('2026-02-30'), today)).toBe(false);
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
