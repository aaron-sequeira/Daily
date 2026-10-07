import { describe, expect, it, vi } from 'vitest';
import { ENTITLEMENT_TTL_MS, makeIsPlus } from '../supabase/functions/daily-ai/entitlement.ts';
import { userIdFrom } from '../supabase/functions/daily-ai/supabase-rest.ts';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function rest(route: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => route(url, init));
  return { rest: { url: 'https://p.supabase.co', anonKey: 'anon', serviceKey: 'service', fetchFn }, fetchFn };
}

describe('userIdFrom', () => {
  it('asks Supabase Auth who the bearer is', async () => {
    const { rest: r, fetchFn } = rest(() => res(200, { id: 'u1', is_anonymous: true }));
    expect(await userIdFrom(r, 'Bearer jwt')).toBe('u1');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://p.supabase.co/auth/v1/user');
    expect(init.headers).toMatchObject({ authorization: 'Bearer jwt', apikey: 'anon' });
  });

  it('refuses a bad or missing token, and the bare anon key (Review Focus 2)', async () => {
    expect(await userIdFrom(rest(() => res(401, { msg: 'invalid' })).rest, 'Bearer anon')).toBeNull();
    expect(await userIdFrom(rest(() => res(200, {})).rest, 'Bearer x')).toBeNull();
    expect(await userIdFrom(rest(() => { throw new Error('down'); }).rest, 'Bearer x')).toBeNull();
  });
});

describe('makeIsPlus', () => {
  const rc = (entitlements: unknown) => res(200, { subscriber: { entitlements } });

  it('uses a fresh cache row without calling RevenueCat', async () => {
    const { rest: r, fetchFn } = rest((url) => url.includes('/rest/v1/entitlements')
      ? res(200, [{ plus: true, expires_at: '2026-11-01T00:00:00Z', checked_at: new Date(NOW - 60_000).toISOString() }])
      : res(500, {}));
    expect(await makeIsPlus(r, 'sk', () => NOW)('u1')).toBe('yes');
    expect(fetchFn.mock.calls.some(([u]) => u.includes('revenuecat'))).toBe(false);
  });

  it('asks RevenueCat when the cache is stale, and saves the answer', async () => {
    const calls: string[] = [];
    const { rest: r, fetchFn } = rest((url, init) => {
      calls.push(`${init.method ?? 'GET'} ${url}`);
      if (url.includes('revenuecat')) return rc({ plus: { expires_date: '2026-10-15T12:00:00Z', grace_period_expires_date: null } });
      if (init.method === 'POST') return res(201, {});
      return res(200, [{ plus: false, expires_at: null, checked_at: new Date(NOW - ENTITLEMENT_TTL_MS - 1).toISOString() }]);
    });
    expect(await makeIsPlus(r, 'sk', () => NOW)('u1')).toBe('yes');
    const rcCall = fetchFn.mock.calls.find(([u]) => u.includes('revenuecat'))!;
    expect(rcCall[0]).toBe('https://api.revenuecat.com/v1/subscribers/u1');
    expect((rcCall[1].headers as Record<string, string>).authorization).toBe('Bearer sk');
    expect(calls.some((c) => c.startsWith('POST https://p.supabase.co/rest/v1/entitlements'))).toBe(true);
  });

  it('treats an expired entitlement as not Plus, but honours a grace period (Review Focus 4)', async () => {
    const run = (ent: unknown) => makeIsPlus(rest((url, init) => url.includes('revenuecat') ? rc(ent) : init.method === 'POST' ? res(201, {}) : res(200, [])).rest, 'sk', () => NOW)('u1');
    expect(await run({ plus: { expires_date: '2026-10-01T00:00:00Z', grace_period_expires_date: null } })).toBe('no');
    expect(await run({ plus: { expires_date: '2026-10-01T00:00:00Z', grace_period_expires_date: '2026-10-09T00:00:00Z' } })).toBe('yes');
    expect(await run({ plus: { expires_date: null } })).toBe('yes'); // lifetime
    expect(await run({})).toBe('no');
  });

  it('saves with merge-duplicates and the right user_id; uses the later of expiry and grace', async () => {
    const { rest: r, fetchFn } = rest((url, init) => url.includes('revenuecat')
      ? rc({ plus: { expires_date: '2026-10-20T00:00:00Z', grace_period_expires_date: '2026-10-01T00:00:00Z' } })
      : init.method === 'POST' ? res(201, {}) : res(200, []));
    expect(await makeIsPlus(r, 'sk', () => NOW)('u1')).toBe('yes');
    const post = fetchFn.mock.calls.find(([, i]) => i.method === 'POST')!;
    expect((post[1].headers as Record<string, string>).prefer).toBe('resolution=merge-duplicates');
    expect(JSON.parse(String(post[1].body))).toMatchObject({ user_id: 'u1', plus: true, expires_at: '2026-10-20T00:00:00Z' });
    expect(post[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('a fresh cache row that has already expired gives no', async () => {
    const { rest: r } = rest(() => res(200, [{ plus: true, expires_at: '2026-10-08T11:00:00Z', checked_at: new Date(NOW - 60_000).toISOString() }]));
    expect(await makeIsPlus(r, 'sk', () => NOW)('u1')).toBe('no');
  });

  it('logs only the status when the cache upsert is not OK', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rest: r } = rest((url, init) => url.includes('revenuecat') ? rc({ plus: { expires_date: null } }) : init.method === 'POST' ? res(500, { secret: 'x' }) : res(200, []));
    expect(await makeIsPlus(r, 'sk', () => NOW)('u1')).toBe('yes');
    expect(JSON.stringify(warn.mock.calls)).toContain('500');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    warn.mockRestore();
  });

  it('falls back to the last known answer when RevenueCat is down, else says no', async () => {
    const stale = res(200, [{ plus: true, expires_at: '2026-11-01T00:00:00Z', checked_at: '2026-10-01T00:00:00Z' }]);
    expect(await makeIsPlus(rest((url) => url.includes('revenuecat') ? res(503, {}) : stale.clone()).rest, 'sk', () => NOW)('u1')).toBe('yes');
    expect(await makeIsPlus(rest((url) => url.includes('revenuecat') ? res(503, {}) : res(200, [])).rest, 'sk', () => NOW)('u1')).toBe('error');
  });
});
