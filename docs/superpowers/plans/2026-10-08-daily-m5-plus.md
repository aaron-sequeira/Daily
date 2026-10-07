# Daily M5: Daily Plus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Daily Plus into a real subscription and add the floating Sunny bubble.

What M5 covers:
- anonymous sign-in
- RevenueCat with Google Play Billing
- the paywall and the "your subscription" screen from the approved mockups
- upsells
- the server checking entitlement and enforcing rate limits before it spends the owner's OpenRouter key
- the floating Sunny bubble

**Architecture:**

The app signs in anonymously with Supabase. The Supabase user id becomes the RevenueCat app user id.

App side:
- `Billing` hides RevenueCat behind an interface. A fake stands in for it in dev builds without keys.
- The entitlement is cached in settings as `plus_until`, so `isPlus(db)` stays synchronous for the headless minute task. It also keeps Plus working offline.

Server side (`daily-ai`), in this order:
1. Verify the caller with Supabase Auth.
2. Check RevenueCat's REST API, cached for 10 minutes in a table.
3. Take a quota slot through a Postgres function. The slot is refunded on failure.
4. Only then call OpenRouter.

The floating bubble:
- It is a Kotlin overlay owned by the Sunny service.
- The JS minute task decides when it shows. When it is visible, coach nudges speak through it.

**Tech Stack:**
- Mobile: Expo SDK 57, React Native 0.86.
- New mobile dependencies: `@supabase/supabase-js` with `expo-sqlite/localStorage`, and `react-native-purchases`.
- Supabase Edge Functions (Deno) and Postgres (PostgREST RPC).
- RevenueCat REST v1.
- Kotlin `WindowManager` overlay.
- Tests: Vitest and JUnit.

**Spec:** `docs/superpowers/specs/2026-10-06-daily-mobile-app-design.md`. The relevant sections are §9.4 (delivery), §9.5 (bubble), §11 (billing and server), §13 (purchase errors) and §15 M5.

**Design:** the mockups canvas https://claude.ai/artifact/JmPUVf1cqE17ygnhgar8Gg, boards **Daily Plus paywall** (`Paywall.dc.html`), **Daily Plus: your subscription** (`Plus.dc.html`) and **Settings** (the Daily Plus rows).

**Deviations from the spec, decided here:**
1. **Rate-limit storage.** The spec's `ai_usage(user_id, day, reports, rewrites, weeks)` becomes `ai_usage(user_id, bucket, count)` with atomic `use_ai` and `refund_ai` functions. The limits stay as the spec says:
   - 1 automatic report per report day
   - 3 rewrites per day
   - 1 week sentence and 2 rewrites per week

   Buckets are keyed by the report's own day or week, so yesterday's late write doesn't eat today's slot.
2. **Refunds.** A request that ends `failed` or `invalid` gives its slot back. Users don't pay for outages or the model's mistakes.
3. **Trial reminder.** The app sets a local "your free week ends in 2 days" reminder on day 5 of the 7-day trial. The mockup shows this, and it makes cancelling honest.
4. **Bubble and full-screen apps.** The bubble hides itself while the app in front is a game or video app (Android category GAME or VIDEO) and while Daily itself is open. This is checked once a minute, by the minute task.
5. **Speech-bubble snooze.** The speech bubble's "Snooze 1 h" is recorded in native storage and applied by the next minute task, up to 60 s later. Nudges are already 20 minutes apart.

## Global Constraints

- **Identity:**
  - Supabase anonymous sign-in on first launch, with no email or password.
  - The Supabase user id is the RevenueCat app user id.
  - Delete everything keeps the sign-in, because the subscription is tied to it. It clears local entitlement settings, which re-sync on the next launch.
- **Products (spec §11):**
  - `plus_monthly` at $3.99 and `plus_yearly` at $29.99.
  - A 7-day free trial offer.
  - Entitlement id `plus`.
  - RevenueCat's default offering, with package types monthly (`$rc_monthly`) and annual (`$rc_annual`).
- **Prices:**
  - Always show the store's localized `priceString`. Never hard-code a price outside the dev fake.
  - "SAVE N%" is computed from the two products' numeric prices.
  - Trial copy appears only when the offer has a free phase. Play omits it for people who aren't eligible.
- **Server checks** (spec §11), in this order:
  1. Supabase JWT, via `GET {SUPABASE_URL}/auth/v1/user`
  2. RevenueCat `GET https://api.revenuecat.com/v1/subscribers/{id}`, cached 10 min in `entitlements`
  3. Quota through `rpc/use_ai`
  4. OpenRouter

  Errors are `'not_plus' | 'limit' | 'invalid' | 'failed'`. A missing or invalid user is a 401 with `failed`.
- **Request shape:** `{ kind: 'report' | 'week', mode: 'auto' | 'rewrite', input }`. Rewrites use `mode: 'rewrite'`; everything else is `auto`.
- **Secrets:**
  - Server only: `OPENROUTER_API_KEY` and `REVENUECAT_SECRET`, set with `supabase secrets set`.
  - The function gets `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` automatically.
  - The app knows only public keys, all in `apps/mobile/.env`, which is gitignored and never committed:
    - `EXPO_PUBLIC_SUPABASE_URL`
    - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
    - `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (starts `goog_`)
  - The repo is public. Never print or commit a secret, and never open `apps/consumer/.env`.
- **Tables:**
  - `entitlements` and `ai_usage` have RLS on and no policies, so only the service role reaches them.
  - `use_ai` and `refund_ai` are `SECURITY DEFINER`, with `EXECUTE` revoked from `anon` and `authenticated`.
- **Offline:** Plus stays on until the cached `plus_until` passes.
- **Copy:** the paywall and subscription screen match the mockups, with these exact strings:
  - "Let Sunny write your day"
  - "Your phone time, turned into a short, kind story every evening."
  - "Start 7-day free trial"
  - "Restore purchases"
  - "Manage in Google Play"
  - "Your free week"
  - "You're on Daily Plus"
  - "Switch to yearly"
  - "Try 7 days free"
- **Purchase errors** (spec §13) each get a one-line message and never block free features. A user who cancels sees nothing.
- **Bubble (spec §9.5):**
  - A 66 dp circle showing the current mood PNG.
  - It can be dragged, and snaps to the nearest side.
  - A tap opens Daily. A long press offers "Hide for today".
  - It is off by default. Turning it on asks for "Display over other apps".
  - Plus only, and only while the Sunny service runs.
- **Delivery (§9.4):** while the bubble is showing, a coach nudge goes to Sunny's speech bubble ("Thanks" / "Snooze 1 h") instead of a notification.
- **Not deployed until the user does it:** M5 writes the migration and the function. Deploying is the user's "go live" step (Task 9 checklist), and it needs their Supabase, RevenueCat and Play Console accounts.
- **Repo rules:**
  - Branch `feat/daily-m5`.
  - Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Never stage `.codex/` or `marketing/`.
  - React stays at 19.2.3, and `node-linker` doesn't change.
  - New native modules need a dev-client rebuild (`npx expo run:android`).

## Review Focus

1. **A user who buys while offline, or whose Play payment is pending.** Plus turns on only when Play confirms. A pending payment shows "Your payment is pending. Plus turns on when it clears." and nothing crashes. Pinned in Task 4.
2. **Someone calling `daily-ai` straight from curl with the public anon key, or with a free account.**
   - The free account gets `not_plus`.
   - An anon key with no user JWT gets 401.
   - A caller can't spend more than the limits, even with parallel requests: the quota is atomic in SQL, and the handler takes it before the model call.
   - Pinned in Task 2.
3. **The AI fails and the user's limited rewrite is spent anyway.** The slot is refunded on `failed` and `invalid`. Pinned in Task 2.
4. **A subscription that lapses, or a refunded purchase.**
   - The app drops Plus when `plus_until` passes, or when RevenueCat says it is no longer active. The server says `not_plus` within 10 minutes.
   - The writer then saves plain reports, and the bubble disappears.
   - Pinned in Tasks 4 and 8.
5. **The bubble over a full-screen video or game, over Daily itself, or after "Hide for today".** It stays hidden, and comes back the next day. Pinned in Task 8 (rules) and Task 7 (the hidden-day pref).

---

### Task 1: The request carries `mode`, the body is capped while streaming, and a skipped retry returns `failed`

**Files:**
- Modify:
  - `supabase-daily/supabase/functions/daily-ai/contract.ts`
  - `supabase-daily/supabase/functions/daily-ai/handler.ts`
  - `supabase-daily/test/sample-request.json`
  - every request literal in `supabase-daily/test/*.test.ts`
  - `apps/mobile/src/report/ai.ts`, `apps/mobile/src/report/writer.ts`, `apps/mobile/src/report/run.ts`
  - `apps/mobile/src/report/contract.test.ts`, `apps/mobile/src/report/ai.test.ts`, `apps/mobile/src/report/writer.test.ts`
- Test: `supabase-daily/test/contract.test.ts`, `supabase-daily/test/handler.test.ts`

**Interfaces:**
- Produces:
  - `AiRequest = { kind: 'report'; mode: Mode; input: ReportInput } | { kind: 'week'; mode: Mode; input: WeekInput }` with `type Mode = 'auto' | 'rewrite'`
  - `readCapped(req: Request, max: number): Promise<string | null>`, exported from handler.ts. It returns null when the body is over `max`.
  - App: `aiReport(cfg, input, mode: 'auto' | 'rewrite')` and `WriterDeps.aiReport(input, mode)`

- [ ] **Step 1: Write the failing tests**

In `supabase-daily/test/sample-request.json`, add `"mode": "auto",` after `"kind": "report",`. In every test file under `supabase-daily/test/`, add `mode: 'auto'` to each request object literal that has a `kind`.

Add to `contract.test.ts`:

```ts
  it('needs a mode: auto or rewrite', () => {
    const r = JSON.parse(JSON.stringify(sample));
    expect(parseRequest({ ...r, mode: 'rewrite' })).toMatchObject({ mode: 'rewrite' });
    delete r.mode;
    expect(parseRequest(r)).toBeNull();
    expect(parseRequest({ ...sample, mode: 'free' })).toBeNull();
  });
```

Add to `handler.test.ts`:

```ts
  it('caps a streamed body without trusting content-length (Review Focus 2)', async () => {
    const { deps, fetchFn } = setup();
    const big = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('x'.repeat(40 * 1024))); c.close(); } });
    const req = new Request('http://local/daily-ai', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: big, duplex: 'half' } as RequestInit);
    expect(await json(await handle(req, deps))).toEqual({ status: 413, body: { ok: false, error: 'failed' } });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('says failed, not invalid, when there is no time left for the retry', async () => {
    let t = 0;
    const invented = { ...good, headline: 'You spent 5 hours on your phone.' };
    const { deps, fetchFn } = setup(answer(invented));
    fetchFn.mockImplementationOnce(async () => { t = 26_000; return answer(invented); });
    expect((await json(await handle(post(sample), { ...deps, now: () => t }))).body).toEqual({ ok: false, error: 'failed' });
  });
```

Adapt the names to the file's existing helpers. The M4 test file already defines `setup`, `answer`, `post`, `json`, `good` and `sample`. If the existing test asserts `invalid` for this same time-skip case, change it to `failed`.

In `apps/mobile/src/report/contract.test.ts`, add `mode: 'auto'` to every `parseRequest({ kind: …, input })` call and to its expected object.

In `apps/mobile/src/report/ai.test.ts`, change the body assertion to `toEqual({ kind: 'report', mode: 'auto', input })` and call `aiReport(c, input, 'auto')`. Then add:

```ts
  it('sends rewrite as the mode for a rewrite', async () => {
    const c = cfg(ok({ ok: true, json: out }));
    await aiReport(c, input, 'rewrite');
    expect(JSON.parse(c.fetchFn.mock.calls[0][1].body).mode).toBe('rewrite');
  });
```

In `apps/mobile/src/report/writer.test.ts`, add:

```ts
  it('asks for a rewrite only from Rewrite', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps({ isPlus: true });
    await writeDueReports(d, at(6, 21), dp, { retryFailed: false });
    expect(dp.aiReport.mock.calls.at(-1)![1]).toBe('auto');
    await rewriteReport(d, '2026-10-06', at(6, 21, 5), dp);
    expect(dp.aiReport.mock.calls.at(-1)![1]).toBe('rewrite');
  });
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @worksight/daily-ai test` and `pnpm --filter @worksight/mobile test`.
Expected: FAIL. `mode` is not parsed yet, there is no streaming cap, and a time-skip still returns `invalid`.

- [ ] **Step 3: Implement**

`contract.ts`:
- `export type Mode = 'auto' | 'rewrite';`
- Change `AiRequest` to carry `mode: Mode`.
- In `parseRequest`, add `const mode = oneOf(['auto', 'rewrite'] as const, v.mode);` and return it in both branches, for example `{ kind: 'report', mode, input: reportInput(v.input) }`.

`handler.ts`:

```ts
/** Reads the body as text, giving up as soon as it passes `max` bytes, whatever content-length claims. */
export async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}
```

In `handle`:
- Replace the `req.text()` read and the byte-length check that follows it with `const text = await readCapped(req, MAX_BODY_BYTES); if (text === null) return failure(413, 'failed');`. Keep the content-length pre-check.
- In the retry loop, replace `if (attempt > 0 && left < RETRY_MIN_MS) break;` with `if (attempt > 0 && left < RETRY_MIN_MS) return failure(200, 'failed'); // ran out of time, not a bad answer: worth retrying later`.

App:
- **`ai.ts`:** `aiReport(cfg, input, mode)` sends `{ kind: 'report', mode, input }`. `aiWeek` sends `{ kind: 'week', mode: 'auto', input }`.
- **`writer.ts`:**
  - Change `WriterDeps.aiReport` to `aiReport(input: ReportInput, mode: 'auto' | 'rewrite'): Promise<AiResult<ReportOut>>`.
  - `rewriteReport` calls `deps.aiReport(input, 'rewrite')`.
  - Every other call passes `'auto'`.
- **`run.ts`:** `liveDeps()` passes the mode through: `aiReport: (i, mode) => aiReport(cfg, i, mode)`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm --filter @worksight/daily-ai test && pnpm --filter @worksight/daily-ai typecheck && pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase-daily apps/mobile/src/report
git commit -m "feat(daily-ai): request mode, streamed body cap, failed on a skipped retry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server: who is calling, are they Plus, and do they have quota left

**Files:**
- Create:
  - `supabase-daily/supabase/functions/daily-ai/supabase-rest.ts`
  - `supabase-daily/supabase/functions/daily-ai/entitlement.ts`
  - `supabase-daily/supabase/functions/daily-ai/quota.ts`
  - `supabase-daily/supabase/migrations/20261008000000_daily_plus.sql`
- Modify:
  - `supabase-daily/supabase/functions/daily-ai/handler.ts`
  - `supabase-daily/supabase/functions/daily-ai/index.ts`
  - `supabase-daily/scripts/dev-server.ts`
- Test:
  - `supabase-daily/test/entitlement.test.ts`, `supabase-daily/test/quota.test.ts`
  - additions to `supabase-daily/test/handler.test.ts`

**Interfaces:**
- Produces:
  - `type Rest = { url: string; anonKey: string; serviceKey: string; fetchFn: FetchFn }`
  - `userIdFrom(rest, authorization): Promise<string | null>`
  - `makeIsPlus(rest, rcSecret, now?): (userId) => Promise<boolean>`, plus `ENTITLEMENT_TTL_MS = 600_000`
  - `type Quota = { use(userId, bucket, limit): Promise<boolean>; refund(userId, bucket): Promise<void> }`
  - `makeQuota(rest): Quota`
  - `LIMITS = { auto: 1, rewrite: 3, weekAuto: 1, weekRewrite: 2 }`
  - `bucketFor(r: AiRequest, utcDay: string): { bucket: string; limit: number }`
  - `Deps` changes to `{ apiKey; models; fetchFn; now?; userId(authorization): Promise<string | null>; isPlus(userId): Promise<boolean>; quota: Quota }`

- [ ] **Step 1: The migration**

`supabase-daily/supabase/migrations/20261008000000_daily_plus.sql`:

```sql
-- Daily Plus: entitlement cache and AI quotas. Only the daily-ai function (service role) touches these.
create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plus boolean not null,
  expires_at timestamptz,
  checked_at timestamptz not null default now()
);

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

alter table public.entitlements enable row level security;
alter table public.ai_usage enable row level security;

-- Takes one slot in `bucket` if fewer than `p_limit` are used; true when it did. Atomic under concurrency.
create function public.use_ai(p_user uuid, p_bucket text, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare taken integer;
begin
  insert into ai_usage (user_id, bucket, count) values (p_user, p_bucket, 1)
  on conflict (user_id, bucket) do update set count = ai_usage.count + 1, updated_at = now()
    where ai_usage.count < p_limit
  returning count into taken;
  return taken is not null;
end $$;

-- Gives a slot back after a failed or invalid answer.
create function public.refund_ai(p_user uuid, p_bucket text) returns void
language sql security definer set search_path = public as $$
  update ai_usage set count = greatest(count - 1, 0), updated_at = now() where user_id = p_user and bucket = p_bucket;
$$;

revoke execute on function public.use_ai(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.refund_ai(uuid, text) from public, anon, authenticated;
```

- [ ] **Step 2: Write the failing tests**

`supabase-daily/test/entitlement.test.ts`:

```ts
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
    expect(await makeIsPlus(r, 'sk', () => NOW)('u1')).toBe(true);
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
    expect(await makeIsPlus(r, 'sk', () => NOW)('u1')).toBe(true);
    const rcCall = fetchFn.mock.calls.find(([u]) => u.includes('revenuecat'))!;
    expect(rcCall[0]).toBe('https://api.revenuecat.com/v1/subscribers/u1');
    expect((rcCall[1].headers as Record<string, string>).authorization).toBe('Bearer sk');
    expect(calls.some((c) => c.startsWith('POST https://p.supabase.co/rest/v1/entitlements'))).toBe(true);
  });

  it('treats an expired entitlement as not Plus, but honours a grace period (Review Focus 4)', async () => {
    const run = (ent: unknown) => makeIsPlus(rest((url, init) => url.includes('revenuecat') ? rc(ent) : init.method === 'POST' ? res(201, {}) : res(200, [])).rest, 'sk', () => NOW)('u1');
    expect(await run({ plus: { expires_date: '2026-10-01T00:00:00Z', grace_period_expires_date: null } })).toBe(false);
    expect(await run({ plus: { expires_date: '2026-10-01T00:00:00Z', grace_period_expires_date: '2026-10-09T00:00:00Z' } })).toBe(true);
    expect(await run({ plus: { expires_date: null } })).toBe(true); // lifetime
    expect(await run({})).toBe(false);
  });

  it('falls back to the last known answer when RevenueCat is down, else says no', async () => {
    const stale = res(200, [{ plus: true, expires_at: '2026-11-01T00:00:00Z', checked_at: '2026-10-01T00:00:00Z' }]);
    expect(await makeIsPlus(rest((url) => url.includes('revenuecat') ? res(503, {}) : stale.clone()).rest, 'sk', () => NOW)('u1')).toBe(true);
    expect(await makeIsPlus(rest((url) => url.includes('revenuecat') ? res(503, {}) : res(200, [])).rest, 'sk', () => NOW)('u1')).toBe(false);
  });
});
```

`supabase-daily/test/quota.test.ts`:

```ts
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
    expect(fetchFn.mock.calls[1][0]).toBe('https://p.supabase.co/rest/v1/rpc/refund_ai');
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
```

Update `handler.test.ts`. The `setup()` deps become:

```ts
  const quota = { use: vi.fn(async () => true), refund: vi.fn(async () => {}) };
  const deps: Deps = { apiKey: 'sk-test', models: [...], fetchFn, userId: async (a) => (a === 'Bearer jwt' ? 'u1' : null), isPlus: async () => true, quota };
  return { deps, sent, fetchFn, quota };
```

Existing tests keep passing. The not-Plus test becomes `isPlus: async () => false`. Add:

```ts
  it('refuses a caller Supabase does not know, before anything else (Review Focus 2)', async () => {
    const { deps, fetchFn, quota } = setup();
    expect(await json(await handle(post(sample, 'Bearer anon-key'), deps))).toEqual({ status: 401, body: { ok: false, error: 'failed' } });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(quota.use).not.toHaveBeenCalled();
  });

  it('says limit when the quota is used up, without calling the model', async () => {
    const { deps, fetchFn, quota } = setup();
    quota.use.mockResolvedValueOnce(false);
    expect(await json(await handle(post(sample), deps))).toEqual({ status: 429, body: { ok: false, error: 'limit' } });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(quota.use).toHaveBeenCalledWith('u1', 'report:2026-10-06', 1);
  });

  it('gives the slot back after failed or invalid, keeps it after success (Review Focus 3)', async () => {
    const a = setup(new Error('down'));
    await handle(post(sample), a.deps);
    expect(a.quota.refund).toHaveBeenCalledWith('u1', 'report:2026-10-06');
    const invented = { ...good, headline: 'You spent 5 hours on your phone.' };
    const b = setup(answer(invented), answer(invented));
    await handle(post(sample), b.deps);
    expect(b.quota.refund).toHaveBeenCalledTimes(1);
    const c = setup(answer(good));
    await handle(post(sample), c.deps);
    expect(c.quota.refund).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `pnpm --filter @worksight/daily-ai test`
Expected: FAIL. The new modules are missing and `Deps` has changed.

- [ ] **Step 4: Implement**

`supabase-rest.ts`:

```ts
import type { FetchFn } from './openrouter.ts';

export type Rest = { url: string; anonKey: string; serviceKey: string; fetchFn: FetchFn };

/** Headers for the service role: only the function holds this key. */
export const service = (r: Rest) => ({ apikey: r.serviceKey, authorization: `Bearer ${r.serviceKey}`, 'content-type': 'application/json' });

/** The signed-in (anonymous) user behind `authorization`, or null. The bare anon key has no user, so it gets null. */
export async function userIdFrom(r: Rest, authorization: string): Promise<string | null> {
  try {
    const res = await r.fetchFn(`${r.url}/auth/v1/user`, { headers: { authorization, apikey: r.anonKey } });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user.id === 'string' && user.id ? user.id : null;
  } catch {
    return null;
  }
}
```

`entitlement.ts`:

```ts
import { service, type Rest } from './supabase-rest.ts';

export const ENTITLEMENT_TTL_MS = 10 * 60_000;
const REVENUECAT = 'https://api.revenuecat.com/v1/subscribers/';

type Row = { plus: boolean; expires_at: string | null; checked_at: string };
const activeAt = (plus: boolean, expires: string | null, now: number) => plus && (expires === null || Date.parse(expires) > now);

/** Spec §11 step 2: RevenueCat decides; its answer is cached for 10 minutes in `entitlements`. */
export function makeIsPlus(r: Rest, rcSecret: string, now: () => number = Date.now) {
  return async (userId: string): Promise<boolean> => {
    const t = now();
    let row: Row | null = null;
    try {
      const res = await r.fetchFn(`${r.url}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(userId)}&select=plus,expires_at,checked_at`, { headers: service(r) });
      if (res.ok) row = ((await res.json()) as Row[])[0] ?? null;
    } catch { /* cache unreachable: ask RevenueCat */ }
    if (row && t - Date.parse(row.checked_at) < ENTITLEMENT_TTL_MS) return activeAt(row.plus, row.expires_at, t);

    try {
      const res = await r.fetchFn(REVENUECAT + encodeURIComponent(userId), { headers: { authorization: `Bearer ${rcSecret}` } });
      if (!res.ok) throw new Error(`revenuecat ${res.status}`);
      const ent = ((await res.json()) as { subscriber?: { entitlements?: Record<string, { expires_date?: string | null; grace_period_expires_date?: string | null }> } })
        .subscriber?.entitlements?.plus;
      const until = ent ? (ent.grace_period_expires_date ?? ent.expires_date ?? null) : null;
      const plus = !!ent && (until === null || Date.parse(until) > t);
      await r.fetchFn(`${r.url}/rest/v1/entitlements`, {
        method: 'POST',
        headers: { ...service(r), prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: userId, plus, expires_at: until, checked_at: new Date(t).toISOString() })
      }).catch(() => {});
      return plus;
    } catch (e) {
      console.warn('daily-ai: entitlement check failed:', e instanceof Error ? e.message : 'unknown');
      return row ? activeAt(row.plus, row.expires_at, t) : false;
    }
  };
}
```

`quota.ts`:

```ts
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
```

`handler.ts`:
- Import `bucketFor` and `type Quota` from `./quota.ts`.
- Change `Deps` to:

```ts
export type Deps = {
  apiKey: string; models: string[]; fetchFn: FetchFn; now?: () => number;
  userId(authorization: string): Promise<string | null>;
  isPlus(userId: string): Promise<boolean>;
  quota: Quota;
};
```

In `handle`, after `parseRequest`:

```ts
  const userId = await deps.userId(auth);
  if (!userId) return failure(401, 'failed');
  if (!(await deps.isPlus(userId))) return failure(403, 'not_plus');
  if (!deps.apiKey) return failure(500, 'failed');
  const slot = bucketFor(request, new Date(start).toISOString().slice(0, 10));
  if (!(await deps.quota.use(userId, slot.bucket, slot.limit))) return failure(429, 'limit');
  const refund = () => deps.quota.refund(userId, slot.bucket);
```

Then:
- Before each `return failure(502, 'failed')`, before the time-skip `failure(200, 'failed')`, and before the final `failure(200, 'invalid')`, add `await refund();`.
- Update the doc comment: `spec §11: validate → user → Plus → quota → model (one retry on a bad answer) → grounded JSON`.

`index.ts`:

```ts
import { makeIsPlus } from './entitlement.ts';
import { handle } from './handler.ts';
import { DEFAULT_MODELS } from './openrouter.ts';
import { makeQuota } from './quota.ts';
import { userIdFrom, type Rest } from './supabase-rest.ts';

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void };

const env = (k: string) => Deno.env.get(k) ?? '';
const models = env('DAILY_AI_MODELS').split(',').map((m) => m.trim()).filter(Boolean);
const rest: Rest = { url: env('SUPABASE_URL'), anonKey: env('SUPABASE_ANON_KEY'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), fetchFn: fetch };

Deno.serve((req) => handle(req, {
  apiKey: env('OPENROUTER_API_KEY'),
  models: models.length ? models : DEFAULT_MODELS,
  fetchFn: fetch,
  userId: (auth) => userIdFrom(rest, auth),
  isPlus: makeIsPlus(rest, env('REVENUECAT_SECRET')),
  quota: makeQuota(rest)
}));
```

`dev-server.ts`: the local stand-in has no Supabase, so give `handle` these deps. They are for the emulator only, bound to 127.0.0.1.

```ts
    userId: async (auth) => (auth.startsWith('Bearer ') ? 'dev-user' : null),
    isPlus: async () => true,
    quota: { use: async () => true, refund: async () => {} }
```

Add a comment: `// ponytail: the local stand-in trusts any bearer and has no quota; the deployed function checks both.`

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter @worksight/daily-ai test && pnpm --filter @worksight/daily-ai typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add supabase-daily
git commit -m "feat(daily-ai): verify the user, check Plus with RevenueCat, enforce quotas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: App identity: anonymous Supabase sign-in, and AI calls carry the user's token

**Files:**
- Create: `apps/mobile/src/plus/supabase.ts`
- Modify:
  - `apps/mobile/src/report/ai.ts`
  - `apps/mobile/src/report/ai.test.ts`
  - `apps/mobile/app/_layout.tsx` (auto-refresh on foreground)
  - `apps/mobile/package.json` (dependency)
- Test: `apps/mobile/src/report/ai.test.ts`

**Interfaces:**
- Produces:
  - `supabase(): SupabaseClient | null`
  - `ensureUserId(): Promise<string | null>`
  - `accessToken(): Promise<string | null>`
  - `AiConfig = { url: string; token: () => Promise<string | null>; apiKey: string | null; fetchFn; timeoutMs }`
  - `aiConfig(): AiConfig | null`, which prefers the dev-server env and otherwise uses Supabase

- [ ] **Step 1: Add the dependency**

From `apps/mobile`, run `npx expo install @supabase/supabase-js`. expo-sqlite is already installed. Check `git diff pnpm-lock.yaml` for react version changes; there should be none.

- [ ] **Step 2: Write the failing test**

In `ai.test.ts`, change the `cfg()` helper to the new shape:

```ts
const cfg = (reply: () => Promise<Response>, token: string | null = 'jwt', apiKey: string | null = null) =>
  ({ url: 'http://10.0.2.2:8787', token: async () => token, apiKey, timeoutMs: 1000, fetchFn: vi.fn(reply) }) as never;
```

Update the first test to expect `authorization: 'Bearer jwt'`. Then add:

```ts
  it('sends the Supabase apikey when there is one, and fails without a session', async () => {
    const c = cfg(ok({ ok: true, json: out }), 'jwt', 'anon-key');
    await aiReport(c, input, 'auto');
    expect(c.fetchFn.mock.calls[0][1].headers).toMatchObject({ authorization: 'Bearer jwt', apikey: 'anon-key' });
    const none = cfg(ok({ ok: true, json: out }), null);
    expect(await aiReport(none, input, 'auto')).toEqual({ ok: false, error: 'failed' });
    expect(none.fetchFn).not.toHaveBeenCalled();
  });
```

Run `pnpm --filter @worksight/mobile test`. It fails because `token` is still a string.

- [ ] **Step 3: Implement**

`apps/mobile/src/plus/supabase.ts`:

```ts
import 'expo-sqlite/localStorage/install';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

/** The app's Supabase client (public URL + anon key from apps/mobile/.env), or null in a build without them. */
export function supabase(): SupabaseClient | null {
  if (client === undefined) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    client = url && key
      ? createClient(url, key, { auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
      : null;
  }
  return client;
}

/** Spec §11: an anonymous Supabase user, created once and kept. Null offline or without config; callers try again later. */
export async function ensureUserId(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: signed, error } = await sb.auth.signInAnonymously();
    if (error) throw error;
    return signed.user?.id ?? null;
  } catch (e) {
    console.warn('daily: sign-in failed', e);
    return null;
  }
}

export async function accessToken(): Promise<string | null> {
  if (!(await ensureUserId())) return null;
  return (await supabase()!.auth.getSession()).data.session?.access_token ?? null;
}
```

`ai.ts`:
- Change `AiConfig` to `{ url: string; token: () => Promise<string | null>; apiKey: string | null; fetchFn: typeof fetch; timeoutMs: number }`.
- Replace `aiConfig()` with:

```ts
/** The local dev server (debug builds on the emulator) when EXPO_PUBLIC_DAILY_AI_URL is set; otherwise the deployed
 * function on Supabase. Neither: AI is unavailable and reports stay plain. */
export function aiConfig(): AiConfig | null {
  const dev = process.env.EXPO_PUBLIC_DAILY_AI_URL ?? '';
  if (dev) return { url: dev, token: async () => process.env.EXPO_PUBLIC_DAILY_AI_TOKEN ?? 'dev', apiKey: null, fetchFn: fetch, timeoutMs: 35_000 };
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return base && anon ? { url: `${base}/functions/v1/daily-ai`, token: accessToken, apiKey: anon, fetchFn: fetch, timeoutMs: 35_000 } : null;
}
```

Import `accessToken` from `'../plus/supabase'`.

In `call()`:
- Before the fetch: `const token = await cfg.token(); if (!token) return { ok: false, error: 'failed' };`.
- Headers become `{ authorization: \`Bearer ${token}\`, 'content-type': 'application/json', ...(cfg.apiKey ? { apikey: cfg.apiKey } : {}) }`.

The test file imports `ai.ts`, which now imports `supabase.ts`. That pulls in `expo-sqlite/localStorage/install`, which doesn't load under Vitest. Add `vi.mock('../plus/supabase', () => ({ accessToken: async () => null }))` at the top of `ai.test.ts`. Add the same mock to `run.test.ts` if it imports `ai`.

`app/_layout.tsx` `Gate`: the AppState handler gets `supabase()?.auth.startAutoRefresh()` on `active` and `supabase()?.auth.stopAutoRefresh()` on `background`. That keeps the Supabase docs' refresh pattern for React Native. Import `supabase` from `'../src/plus/supabase'`.

- [ ] **Step 4: Run the tests, typecheck and a smoke test**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`
Expected: all pass.

Rebuild the dev client (`npx expo run:android`) on the emulator and open Daily.
- With no Supabase env set, nothing changes and nothing crashes.
- With the dev-server env from M4, a Plus report still writes through the dev server.
- If supabase-js fails at runtime on a missing `URL` or `structuredClone`, add `react-native-url-polyfill` (`npx expo install react-native-url-polyfill`) and `import 'react-native-url-polyfill/auto'` as the first line of `supabase.ts`. Note it in the report.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src apps/mobile/app apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): anonymous Supabase sign-in; AI calls carry the user's token

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Billing: RevenueCat behind an interface, entitlement cached in settings, trial reminder

**Files:**
- Create:
  - `apps/mobile/src/plus/billing.ts`, which holds the interface, the pure mappers and the error messages
  - `apps/mobile/src/plus/revenuecat.ts`
  - `apps/mobile/src/plus/fakeBilling.ts`
  - `apps/mobile/src/plus/getBilling.ts`
  - `apps/mobile/src/plus/entitlement.ts`, which syncs to settings and schedules the trial reminder
  - `apps/mobile/src/plus/start.ts`, which wires the launch path
- Modify:
  - `apps/mobile/src/plus/plus.ts`
  - `apps/mobile/src/db/settings.ts`
  - `apps/mobile/src/reminders/notifier.ts`, `expoNotifier.ts` and `fakeNotifier.ts`
  - `apps/mobile/app/_layout.tsx`
  - `apps/mobile/package.json`
- Test:
  - `apps/mobile/src/plus/billing.test.ts`
  - `apps/mobile/src/plus/entitlement.test.ts`
  - `apps/mobile/src/plus/plus.test.ts`

**Interfaces:**
- Produces:
  - Types:
    - `type PlanId = 'monthly' | 'yearly'`
    - `type Offer = { plan: PlanId; productId: string; price: number; priceString: string; perMonthString: string; trialDays: number | null }`
    - `type Entitlement = { active: boolean; untilMs: number | null; plan: PlanId | null; trial: boolean; willRenew: boolean }`
    - `type PurchaseResult = { ok: true; ent: Entitlement } | { ok: false; cancelled: boolean; message: string }`
  - `interface Billing { start(userId: string | null): Promise<void>; logIn(userId: string): Promise<void>; offers(): Promise<Offer[]>; purchase(plan: PlanId): Promise<PurchaseResult>; restore(): Promise<Entitlement>; entitlement(): Promise<Entitlement>; onChange(cb: (e: Entitlement) => void): () => void; manageUrl(plan: PlanId | null): string }`
  - Pure helpers in `billing.ts`:
    - `savePercent(offers): number | null`
    - `purchaseMessage(code: string | null): string`
    - `NO_ENTITLEMENT: Entitlement`
    - `toEntitlement(info: RcCustomerInfo, nowMs): Entitlement`
    - `toOffer(pkg: RcPackage): Offer | null`
  - `getBilling(): Billing`, which returns RevenueCat when `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` is set, otherwise the fake in `__DEV__`, otherwise a billing that offers nothing
  - `saveEntitlement(db, ent, notifier, nowMs): Promise<void>`
  - `isPlus(db, nowMs = Date.now()): boolean`
  - `startPlus(db, deps: { ensureUserId: () => Promise<string | null>; billing: Billing; notifier: Notifier }): Promise<void>`
  - `Notifier.scheduleTrialReminder(atMs: number, body: string): Promise<void>` and `Notifier.cancelTrialReminder(): Promise<void>`
  - Settings keys:
    - `plus_until` ('0'; ms; `'-1'` means no expiry)
    - `plus_plan` ('')
    - `plus_trial` ('0')
    - `plus_renews` ('0')

- [ ] **Step 1: Add the dependency**

From `apps/mobile`, run `npx expo install react-native-purchases`. The core SDK is enough; the paywall is ours. Check that the lockfile shows no React change.

- [ ] **Step 2: Write the failing tests**

`apps/mobile/src/plus/billing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { purchaseMessage, savePercent, toEntitlement, toOffer, type Offer } from './billing';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const offer = (plan: 'monthly' | 'yearly', price: number): Offer => ({ plan, productId: `plus_${plan}`, price, priceString: `$${price}`, perMonthString: '', trialDays: 7 });

describe('billing helpers', () => {
  it('computes the yearly saving from the two prices', () => {
    expect(savePercent([offer('monthly', 3.99), offer('yearly', 29.99)])).toBe(37);
    expect(savePercent([offer('yearly', 29.99)])).toBeNull();
  });

  it('reads RevenueCat customer info into an entitlement', () => {
    const info = { entitlements: { active: { plus: { isActive: true, expirationDate: '2026-10-15T12:00:00Z', periodType: 'TRIAL', willRenew: true, productIdentifier: 'plus_yearly:yearly' } } } };
    expect(toEntitlement(info, NOW)).toEqual({ active: true, untilMs: Date.parse('2026-10-15T12:00:00Z'), plan: 'yearly', trial: true, willRenew: true });
    expect(toEntitlement({ entitlements: { active: {} } }, NOW)).toEqual({ active: false, untilMs: null, plan: null, trial: false, willRenew: false });
    const lapsed = { entitlements: { active: { plus: { isActive: true, expirationDate: '2026-10-01T00:00:00Z', periodType: 'NORMAL', willRenew: false, productIdentifier: 'plus_monthly' } } } };
    expect(toEntitlement(lapsed, NOW).active).toBe(false); // Review Focus 4
  });

  it('reads a package into an offer, with the trial only when Play offers one', () => {
    const pkg = (id: string, freePhase: unknown) => ({ packageType: id === 'plus_yearly' ? 'ANNUAL' : 'MONTHLY', product: { identifier: id, price: id === 'plus_yearly' ? 29.99 : 3.99, priceString: id === 'plus_yearly' ? '$29.99' : '$3.99', pricePerMonthString: id === 'plus_yearly' ? '$2.50' : '$3.99', defaultOption: { freePhase } } });
    expect(toOffer(pkg('plus_yearly', { billingPeriod: { unit: 'DAY', value: 7 } }))).toEqual({ plan: 'yearly', productId: 'plus_yearly', price: 29.99, priceString: '$29.99', perMonthString: '$2.50', trialDays: 7 });
    expect(toOffer(pkg('plus_monthly', null))!.trialDays).toBeNull();
    expect(toOffer({ packageType: 'LIFETIME', product: { identifier: 'x', price: 1, priceString: '$1', defaultOption: null } })).toBeNull();
  });

  it('says one calm line per purchase problem (spec §13; Review Focus 1)', () => {
    expect(purchaseMessage('PAYMENT_PENDING_ERROR')).toBe('Your payment is pending. Plus turns on when it clears.');
    expect(purchaseMessage('NETWORK_ERROR')).toBe('Couldn’t reach Google Play. Check your connection and try again.');
    expect(purchaseMessage('PRODUCT_ALREADY_PURCHASED_ERROR')).toBe('You already have Daily Plus. Tap Restore purchases.');
    expect(purchaseMessage('STORE_PROBLEM_ERROR')).toBe('Google Play had a problem. Try again in a moment.');
    expect(purchaseMessage(null)).toBe('Something went wrong. You haven’t been charged.');
  });
});
```

`apps/mobile/src/plus/entitlement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { FakeNotifier } from '../reminders/fakeNotifier';
import { saveEntitlement } from './entitlement';
import { isPlus } from './plus';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const DAY = 86_400_000;

describe('saveEntitlement', () => {
  it('caches Plus until it ends and reminds two days before a trial ends', async () => {
    const db = await makeTestDb();
    const n = new FakeNotifier();
    await saveEntitlement(db, { active: true, untilMs: NOW + 7 * DAY, plan: 'yearly', trial: true, willRenew: true }, n, NOW);
    expect(getSetting(db, 'plus_until')).toBe(String(NOW + 7 * DAY));
    expect(isPlus(db, NOW)).toBe(true);
    expect(isPlus(db, NOW + 7 * DAY + 1)).toBe(false); // offline, past the end (Review Focus 4)
    expect(n.trialReminder).toEqual({ atMs: NOW + 5 * DAY, body: 'Your free week ends in 2 days. Cancel in Google Play if Daily Plus isn’t for you.' });
  });

  it('clears everything when the entitlement is gone, and cancels the reminder', async () => {
    const db = await makeTestDb();
    const n = new FakeNotifier();
    await saveEntitlement(db, { active: true, untilMs: NOW + 7 * DAY, plan: 'yearly', trial: true, willRenew: true }, n, NOW);
    await saveEntitlement(db, { active: false, untilMs: null, plan: null, trial: false, willRenew: false }, n, NOW);
    expect(isPlus(db, NOW)).toBe(false);
    expect(n.trialReminder).toBeNull();
  });

  it('keeps no reminder for a paid plan or a cancelled trial, and treats no expiry as forever', async () => {
    const db = await makeTestDb();
    const n = new FakeNotifier();
    await saveEntitlement(db, { active: true, untilMs: NOW + 7 * DAY, plan: 'yearly', trial: true, willRenew: false }, n, NOW);
    expect(n.trialReminder).toBeNull();
    await saveEntitlement(db, { active: true, untilMs: null, plan: 'yearly', trial: false, willRenew: true }, n, NOW);
    expect(isPlus(db, NOW + 1000 * DAY)).toBe(true);
  });
});
```

`apps/mobile/src/plus/plus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { isPlus } from './plus';

describe('isPlus', () => {
  it('is off by default, on until plus_until, and the developer switch still works', async () => {
    const db = await makeTestDb();
    expect(isPlus(db, 1000)).toBe(false);
    setSetting(db, 'plus_until', 2000);
    expect(isPlus(db, 1000)).toBe(true);
    expect(isPlus(db, 2001)).toBe(false);
    setSetting(db, 'plus_until', -1);
    expect(isPlus(db, 9e15)).toBe(true);
    setSetting(db, 'plus_until', 0);
    setSetting(db, 'dev_plus', '1');
    expect(isPlus(db, 1000)).toBe(true);
  });
});
```

Add `trialReminder: { atMs: number; body: string } | null = null` to `FakeNotifier`, with `scheduleTrialReminder(atMs, body)` setting it and `cancelTrialReminder()` clearing it.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL. The modules are missing.

- [ ] **Step 4: Implement**

`settings.ts` DEFAULTS: add `plus_until: '0'`, `plus_plan: ''`, `plus_trial: '0'` and `plus_renews: '0'`.

`plus.ts`:

```ts
import type { Db } from '../db/db';
import { getNumber, getSetting } from '../db/settings';

/** Daily Plus, from the entitlement cached by saveEntitlement (works offline until it ends; spec §11). The developer
 * switch still forces it on in debug builds. */
export function isPlus(db: Db, nowMs: number = Date.now()): boolean {
  if (getSetting(db, 'dev_plus') === '1') return true;
  const until = getNumber(db, 'plus_until');
  return until === -1 || until > nowMs;
}
```

`billing.ts`:

```ts
export type PlanId = 'monthly' | 'yearly';
export type Offer = { plan: PlanId; productId: string; price: number; priceString: string; perMonthString: string; trialDays: number | null };
export type Entitlement = { active: boolean; untilMs: number | null; plan: PlanId | null; trial: boolean; willRenew: boolean };
export type PurchaseResult = { ok: true; ent: Entitlement } | { ok: false; cancelled: boolean; message: string };

export interface Billing {
  start(userId: string | null): Promise<void>;
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
  const days = free?.value ? free.value * (free.unit === 'WEEK' ? 7 : free.unit === 'MONTH' ? 30 : 1) : null;
  return {
    plan, productId: pkg.product.identifier, price: pkg.product.price, priceString: pkg.product.priceString,
    perMonthString: pkg.product.pricePerMonthString ?? pkg.product.priceString, trialDays: days
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

/** Spec §13: one line, never alarming; a cancelled purchase shows nothing (the caller checks `cancelled`). */
export function purchaseMessage(code: string | null): string {
  return (code && MESSAGES[code]) || 'Something went wrong. You haven’t been charged.';
}
```

`revenuecat.ts`. This uses the installed `react-native-purchases` types. If an exact member differs in the installed version, keep the mapping in `toOffer`/`toEntitlement` and note it in the report.

```ts
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
```

`fakeBilling.ts` is for debug builds with no RevenueCat key. It lets the paywall and subscription screens be used on the emulator.

```ts
import { NO_ENTITLEMENT, type Billing, type Entitlement, type Offer } from './billing';

const DAY = 86_400_000;

/** Debug builds without a RevenueCat key: fixed US prices and an instant 7-day trial. Never used in release builds. */
export function fakeBilling(): Billing {
  let current: Entitlement = NO_ENTITLEMENT;
  const listeners = new Set<(e: Entitlement) => void>();
  const set = (e: Entitlement) => { current = e; for (const l of listeners) l(e); return e; };
  const offers: Offer[] = [
    { plan: 'yearly', productId: 'plus_yearly', price: 29.99, priceString: '$29.99', perMonthString: '$2.50', trialDays: 7 },
    { plan: 'monthly', productId: 'plus_monthly', price: 3.99, priceString: '$3.99', perMonthString: '$3.99', trialDays: 7 }
  ];
  return {
    async start() {},
    async logIn() {},
    async offers() { return offers; },
    async purchase(plan) { return { ok: true, ent: set({ active: true, untilMs: Date.now() + 7 * DAY, plan, trial: true, willRenew: true }) }; },
    async restore() { return current; },
    async entitlement() { return current; },
    onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    manageUrl() { return 'https://play.google.com/store/account/subscriptions'; }
  };
}
```

`apps/mobile/src/plus/getBilling.ts` is its own file, so `billing.ts` stays free of native imports and its pure helpers can be tested in Vitest:

```ts
import type { Billing } from './billing';
import { fakeBilling } from './fakeBilling';
import { revenueCatBilling } from './revenuecat';

let billing: Billing | undefined;
/** RevenueCat with the public Android key from apps/mobile/.env; the fake in debug builds without one; else nothing to buy. */
export function getBilling(): Billing {
  if (!billing) {
    const key = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
    billing = key ? revenueCatBilling(key) : __DEV__ ? fakeBilling() : { ...fakeBilling(), offers: async () => [] };
  }
  return billing;
}
```

`entitlement.ts`:

```ts
import type { Db } from '../db/db';
import { setSetting } from '../db/settings';
import type { Notifier } from '../reminders/notifier';
import type { Entitlement } from './billing';

const REMIND_BEFORE_MS = 2 * 86_400_000;

/** Caches the entitlement for isPlus() (offline-safe) and keeps the trial reminder honest: two days before a trial
 * that will renew, never for a paid plan or a cancelled trial. */
export async function saveEntitlement(db: Db, e: Entitlement, notifier: Notifier, nowMs: number): Promise<void> {
  setSetting(db, 'plus_until', e.active ? (e.untilMs ?? -1) : 0);
  setSetting(db, 'plus_plan', e.active ? (e.plan ?? '') : '');
  setSetting(db, 'plus_trial', e.active && e.trial ? '1' : '0');
  setSetting(db, 'plus_renews', e.active && e.willRenew ? '1' : '0');
  const at = e.active && e.trial && e.willRenew && e.untilMs !== null ? e.untilMs - REMIND_BEFORE_MS : null;
  if (at !== null && at > nowMs) await notifier.scheduleTrialReminder(at, 'Your free week ends in 2 days. Cancel in Google Play if Daily Plus isn’t for you.').catch(() => {});
  else await notifier.cancelTrialReminder().catch(() => {});
}
```

`start.ts`:

```ts
import type { Db } from '../db/db';
import type { Notifier } from '../reminders/notifier';
import type { Billing } from './billing';
import { saveEntitlement } from './entitlement';

let unsubscribe: (() => void) | null = null;

/** App launch: sign in (anonymously), point RevenueCat at that user, and keep the cached entitlement current. Never
 * throws; offline it keeps the last known entitlement and tries again on the next launch. */
export async function startPlus(db: Db, deps: { ensureUserId: () => Promise<string | null>; billing: Billing; notifier: Notifier }): Promise<void> {
  try {
    const userId = await deps.ensureUserId();
    await deps.billing.start(userId);
    if (userId) await deps.billing.logIn(userId);
    unsubscribe ??= deps.billing.onChange((e) => { saveEntitlement(db, e, deps.notifier, Date.now()).catch(() => {}); });
    await saveEntitlement(db, await deps.billing.entitlement(), deps.notifier, Date.now());
  } catch (e) {
    console.warn('daily: Plus start failed', e);
  }
}
```

Add a test to `entitlement.test.ts` with a fake billing object literal and a FakeNotifier:
- `startPlus` saves the entitlement the billing reports.
- An `onChange` callback later updates `plus_until`.
- `ensureUserId` returning null still starts billing anonymously, with `start(null)` called and `logIn` not called.

Notifier:
- `scheduleTrialReminder(atMs, body)` schedules identifier `trial-reminder` with title "Your free week ends soon", on the `reports` channel, with data `{ route: '/settings/plus' }`.
- `cancelTrialReminder()` cancels `trial-reminder`.
- Add both to `notifier.ts`, `expoNotifier.ts` and `fakeNotifier.ts`.

`app/_layout.tsx`: in the setup effect, after notifications are set up, call `startPlus(getDb(), { ensureUserId, billing: getBilling(), notifier: expoNotifier })`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src apps/mobile/app apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): billing behind an interface (RevenueCat, dev fake), cached entitlement, trial reminder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The paywall

**Files:**
- Create: `apps/mobile/app/paywall.tsx`, `apps/mobile/src/plus/paywallCopy.ts`
- Modify: `apps/mobile/app/_layout.tsx` (modal route)
- Test: `apps/mobile/src/plus/paywallCopy.test.ts`

**Interfaces:**
- Consumes: `getBilling`, `Offer`, `PlanId`, `savePercent`, `saveEntitlement` (Task 4).
- Produces:
  - route `/paywall`
  - `ctaLabel(offer: Offer | undefined): string`
  - `finePrint(offer: Offer | undefined): string`
  - `day7Label(offer: Offer | undefined): string`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/plus/paywallCopy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Offer } from './billing';
import { ctaLabel, day7Label, finePrint } from './paywallCopy';

const y: Offer = { plan: 'yearly', productId: 'plus_yearly', price: 29.99, priceString: '$29.99', perMonthString: '$2.50', trialDays: 7 };
const m: Offer = { plan: 'monthly', productId: 'plus_monthly', price: 3.99, priceString: '$3.99', perMonthString: '$3.99', trialDays: 7 };

describe('paywall copy', () => {
  it('offers the trial when Play does', () => {
    expect(ctaLabel(y)).toBe('Start 7-day free trial');
    expect(finePrint(y)).toBe('7 days free, then $29.99 a year. Cancel anytime in Google Play before day 7 and you won’t pay.');
    expect(day7Label(m)).toBe('$3.99 a month starts');
  });

  it('asks to subscribe, with the price, when there is no trial', () => {
    expect(ctaLabel({ ...m, trialDays: null })).toBe('Subscribe for $3.99 a month');
    expect(finePrint({ ...y, trialDays: null })).toBe('$29.99 a year, renews automatically. Cancel anytime in Google Play.');
  });

  it('has something sensible before prices load', () => {
    expect(ctaLabel(undefined)).toBe('Loading prices…');
    expect(finePrint(undefined)).toBe('');
  });
});
```

Run it. It fails because the module is missing.

- [ ] **Step 2: Implement the copy helpers**

`apps/mobile/src/plus/paywallCopy.ts`:

```ts
import type { Offer } from './billing';

const per = (o: Offer) => (o.plan === 'yearly' ? 'a year' : 'a month');

export function ctaLabel(o: Offer | undefined): string {
  if (!o) return 'Loading prices…';
  return o.trialDays ? `Start ${o.trialDays}-day free trial` : `Subscribe for ${o.priceString} ${per(o)}`;
}

export function finePrint(o: Offer | undefined): string {
  if (!o) return '';
  return o.trialDays
    ? `${o.trialDays} days free, then ${o.priceString} ${per(o)}. Cancel anytime in Google Play before day ${o.trialDays} and you won’t pay.`
    : `${o.priceString} ${per(o)}, renews automatically. Cancel anytime in Google Play.`;
}

export function day7Label(o: Offer | undefined): string {
  return o ? `${o.priceString} ${per(o)} starts` : '';
}
```

- [ ] **Step 3: The screen**

In `app/_layout.tsx`, add `<Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />` inside the `Stack`.

`apps/mobile/app/paywall.tsx` follows the **Daily Plus paywall** board from top to bottom.

**Top bar:**
- A "Restore" text button on the left (min 44 dp).
- A round close button on the right (44 dp, `accessibilityLabel="Close"`) that calls `router.back()`.

**Hero, 172 high:**
- A `#FFE9C2` halo circle (150) with a breathing scale loop. Skip the loop when `useReducedMotion()` is on.
- `<Sunny face="glowing" size={112} />`, entering with a spring.
- A purple story chip (`#D8D2FC`) rotated 5° on the right, reading "YOUR DAY, WRITTEN / A calmer day: 2h 48m, 34m under your average."
- A white pill rotated −4° on the left with a 30 dp happy Sunny and "Nice break, keep it up".
- Both chips use `FadeInDown` delays of 450 and 600 ms.

**Title block:**
- A black "DAILY PLUS" pill with gold `#FFC861` text.
- "Let Sunny write your day" in `F.semi` 28.
- "Your phone time, turned into a short, kind story every evening." in 14, `C.body`.

**Perks card:** white, radius 20, with four rows. Each row has a 34 dp circle icon (theme `Icon` or inline SVG paths from the board), a bold title and a muted line:
- Your day, written — A short story at 9 pm, with two small things to try tomorrow. (`#D8D2FC`)
- Week in a sentence — How your week went, next to the one before. (`#BFEBD3`)
- Rewrite any day — Not quite right? Ask Sunny for another take. (`#F4C6C8`)
- Sunny on top — A floating Sunny bubble that cheers you on in other apps. (`#F9DDB9`)

**Plan cards:**
- These are radio buttons: `accessibilityRole="radio"`, `accessibilityState={{ checked }}`.
- Yearly is first and selected by default.
- Each card shows the plan name, a muted line, the price on the right, and a dot that fills black when selected.
  - Yearly's line is "`{perMonthString}` a month, billed once a year".
  - Monthly's line is "Billed every month".
- A gold "SAVE `{savePercent}`%" badge sits on the yearly card when `savePercent` is not null.
- The selected card has a 2 dp ink border; the others have a 1.5 dp `C.line` border.

**Trial timeline:** shown only when the selected offer has `trialDays`. It has three columns joined by a line:
- Today / Everything unlocks
- Day 5 / We remind you
- Day 7 / `day7Label(offer)`

**The rest of the screen:**
- **CTA:** a black pill, 56 high, with label `ctaLabel(offer)`. It is disabled while the offer is missing or a purchase is in flight, and shows an ActivityIndicator while buying.
- **Fine print:** `finePrint(offer)`, centred, 12, muted.
- **Footer:** "Restore purchases · Terms · Privacy" as text buttons, 44 dp high. Terms opens `https://aaron-sequeira.github.io/Daylens/daily/terms.html` and Privacy opens `https://aaron-sequeira.github.io/Daylens/daily/privacy.html` through `Linking.openURL`. Those pages arrive in M6.

**Behaviour:**
- On mount, `getBilling().offers()`.
  - On error or an empty list, show "Couldn’t load prices. Check your connection." with a "Try again" button, and keep the CTA disabled.
- **Buy:** `getBilling().purchase(plan)`.
  - On `ok`, run `saveEntitlement(getDb(), r.ent, expoNotifier, Date.now())` and then `router.back()`.
  - On `cancelled`, do nothing.
  - Otherwise show `r.message` in one muted line above the CTA.
  - A double tap is guarded with a ref.
- **Restore:** `getBilling().restore()`, then `saveEntitlement`.
  - If the result is active, `router.back()`.
  - Otherwise show "No Daily Plus purchase found for this Google account."
  - On error, show `purchaseMessage(null)`.
- **Motion:** `rise(i)` entrances, staggered as on the board. The CTA pulses once with a ring scale that is skipped when reduce motion is on.

- [ ] **Step 4: Run the tests, typecheck and a device check**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`.

On the emulator, use a debug build with no RevenueCat key, so the fake billing is used:
- open `/paywall` (a temporary link, or `adb shell am start -a android.intent.action.VIEW -d "daily://paywall"`);
- check the screen matches the board;
- yearly is selected, with SAVE 37% and the timeline;
- monthly switches the day-7 label and the fine print;
- "Start 7-day free trial" closes the screen and `isPlus` is now on (the Report tab shows Rewrite);
- turn on "Remove animations" and check the halo is still.

Save screenshots to the workspace `shots/` folder.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app apps/mobile/src/plus
git commit -m "feat(mobile): Daily Plus paywall

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Your subscription, the Settings rows and upsells

**Files:**
- Create:
  - `apps/mobile/app/settings/plus.tsx`
  - `apps/mobile/src/plus/status.ts`
- Modify:
  - `apps/mobile/app/settings/index.tsx`
  - `apps/mobile/app/(tabs)/report.tsx`
  - `apps/mobile/app/(tabs)/week.tsx`
  - `apps/mobile/src/report/run.ts` (the rewrite counter)
  - `apps/mobile/src/db/settings.ts`
- Test: `apps/mobile/src/plus/status.test.ts`

**Interfaces:**
- Consumes:
  - `isPlus` and the `plus_*` settings (Task 4)
  - `getBilling` and `saveEntitlement` (Task 4)
  - `runRewrite` (M4)
- Produces:
  - `type PlusStatus = { title: string; sub: string; trialDay: number | null; trialDays: number; plan: PlanId | null; monthly: boolean }`
  - `plusStatus(db, nowMs): PlusStatus | null` (null when the user is not Plus)
  - `rewritesLeft(db, nowMs): number`
  - `noteRewrite(db, nowMs): void`
  - settings key `rewrites_today` ('')

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/plus/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { noteRewrite, plusStatus, rewritesLeft } from './status';

const DAY = 86_400_000;
const at = (d: number, h = 12) => new Date(2026, 9, d, h).getTime();

describe('plusStatus', () => {
  it('describes a trial with its day and end, then a paid plan', async () => {
    const db = await makeTestDb();
    expect(plusStatus(db, at(8))).toBeNull();
    setSetting(db, 'plus_until', at(14));
    setSetting(db, 'plus_plan', 'yearly');
    setSetting(db, 'plus_trial', '1');
    setSetting(db, 'plus_renews', '1');
    expect(plusStatus(db, at(9))).toMatchObject({ title: 'Your free week', sub: 'Day 3 of 7 · Yearly plan', trialDay: 3, monthly: false }); // started 7 Oct
    setSetting(db, 'plus_trial', '0');
    setSetting(db, 'plus_until', at(14) + 364 * DAY);
    expect(plusStatus(db, at(10))).toMatchObject({ title: 'You’re on Daily Plus', sub: 'Yearly · renews 13 Oct 2027', trialDay: null });
    setSetting(db, 'plus_renews', '0');
    expect(plusStatus(db, at(10))!.sub).toBe('Yearly · ends 13 Oct 2027');
    setSetting(db, 'plus_plan', 'monthly');
    expect(plusStatus(db, at(10))!.monthly).toBe(true);
  });

  it('counts rewrites left today (3 a day, resets at midnight)', async () => {
    const db = await makeTestDb();
    expect(rewritesLeft(db, at(8))).toBe(3);
    noteRewrite(db, at(8));
    noteRewrite(db, at(8, 13));
    expect(rewritesLeft(db, at(8))).toBe(1);
    expect(rewritesLeft(db, at(9))).toBe(3);
  });
});
```

Run it. It fails because the module is missing.

- [ ] **Step 2: Implement `status.ts`**

```ts
import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { getNumber, getSetting, setSetting } from '../db/settings';
import type { PlanId } from './billing';
import { isPlus } from './plus';

const DAY = 86_400_000;
const TRIAL_DAYS = 7;
export const REWRITES_PER_DAY = 3; // spec §11; the server enforces it, this only shows it
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (ms: number) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export type PlusStatus = { title: string; sub: string; trialDay: number | null; trialDays: number; plan: PlanId | null; monthly: boolean };

export function plusStatus(db: Db, nowMs: number): PlusStatus | null {
  if (!isPlus(db, nowMs)) return null;
  const until = getNumber(db, 'plus_until');
  const plan = (getSetting(db, 'plus_plan') || null) as PlanId | null;
  const name = plan === 'monthly' ? 'Monthly' : 'Yearly';
  if (getSetting(db, 'plus_trial') === '1' && until > 0) {
    const day = Math.min(TRIAL_DAYS, Math.max(1, TRIAL_DAYS - Math.ceil((until - nowMs) / DAY) + 1));
    return { title: 'Your free week', sub: `Day ${day} of ${TRIAL_DAYS} · ${name} plan`, trialDay: day, trialDays: TRIAL_DAYS, plan, monthly: plan === 'monthly' };
  }
  const when = until === -1 ? '' : ` · ${getSetting(db, 'plus_renews') === '1' ? 'renews' : 'ends'} ${date(until)}`;
  return { title: 'You’re on Daily Plus', sub: `${name}${when}`, trialDay: null, trialDays: TRIAL_DAYS, plan, monthly: plan === 'monthly' };
}

export function rewritesLeft(db: Db, nowMs: number): number {
  const [day, n] = getSetting(db, 'rewrites_today').split('|');
  return day === localDate(nowMs) ? Math.max(0, REWRITES_PER_DAY - Number(n || 0)) : REWRITES_PER_DAY;
}

export function noteRewrite(db: Db, nowMs: number): void {
  setSetting(db, 'rewrites_today', `${localDate(nowMs)}|${REWRITES_PER_DAY - rewritesLeft(db, nowMs) + 1}`);
}
```

Add `rewrites_today: ''` to DEFAULTS in `settings.ts`. In `run.ts` `runRewrite`, after `rewriteReport` resolves, call `noteRewrite(getDb(), Date.now())` when the result is `null` (success). On `'limit'`, set the counter to the full limit: `setSetting(db, 'rewrites_today', \`${localDate(now)}|3\`)`.

Re-run the tests; they pass.

- [ ] **Step 3: Screens**

`apps/mobile/app/settings/plus.tsx` follows the **Daily Plus: your subscription** board.

**Header:** a round 44 dp back button and "Daily Plus".

**Status card** (`#FCEBC9`, radius 24):
- A black PLUS pill in the top right.
- `<Sunny face="glowing" size={64} />` with `status.title` and `status.sub`.
- When `trialDay` is set, add a progress bar at `trialDay / trialDays`, growing from the left with Reanimated, plus the line: "Then {yearly or monthly price from the offers, or nothing if unknown}. We’ll remind you two days before. Cancel before it ends and you won’t pay."

**Switch to yearly** (only when `status.monthly`):
- A black row "Switch to yearly" with the sub "{yearly priceString} a year instead of {monthly price ×12}" and a gold SAVE badge.
- It opens `/paywall`.

**"Today" group:**
- "Tonight’s story": "Written at {write time}" if today's report is saved, else "Coming at {write time}".
- "Rewrites today": three pips (filled = used) and "{n} left".
- "Week in a sentence": "Written for last week" when `loadWeekSentence` exists for last week, else "Arrives when the week ends".

**"Your plan" group:**
- "Manage in Google Play" (external icon) runs `Linking.openURL(getBilling().manageUrl(status.plan))`.
- "Restore purchases" runs `getBilling().restore()` then `saveEntitlement`, and refreshes.
- "See what’s included" opens `/paywall`.

**Footnote** (12, muted): "To write your story, Daily Plus sends app names and minutes only — never messages, notifications or what’s on your screen. Google Play handles your subscription; cancel there anytime and Plus stays on until the period ends."

**Not Plus:** when `plusStatus` is null (lapsed while open), show the paywall's title block and a "See Daily Plus" button instead.

`app/settings/index.tsx`, Report group, first row:
- Not Plus: a `Link` to `/paywall` showing a black "PLUS" pill, "Daily Plus", and "Try 7 days free" on the right in `F.semi` ink.
- Plus: a `Link` to `/settings/plus`, "Your subscription", with `plusStatus().sub` on the right.
- Re-read on focus, so the row updates after a purchase.

Upsells:
- `report.tsx`: the existing free "Daily Plus" card gets a black pill button "See Daily Plus" (44 dp) that pushes `/paywall`.
- `week.tsx`: for free users, under the sentence card's text, add the text button "Daily Plus writes this for you" (44 dp) that pushes `/paywall`.

- [ ] **Step 4: Run the tests, typecheck and a device check**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`.

On the emulator with the fake billing:
- Settings shows "Daily Plus · Try 7 days free", which opens the paywall.
- After the fake trial, the row reads "Your subscription · Day 1 of 7 · Yearly plan". The subscription screen matches the board, the trial bar is shown, and Manage opens Play.
- The upsells show only for free users.

Save screenshots.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app apps/mobile/src
git commit -m "feat(mobile): your subscription screen, Daily Plus rows and upsells

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The floating Sunny bubble (native)

**Files:**
- Create:
  - `apps/mobile/modules/daily-native/android/src/main/java/expo/modules/dailynative/Bubble.kt`
  - `apps/mobile/modules/daily-native/android/src/test/java/expo/modules/dailynative/BubbleTest.kt`
- Modify:
  - `DailyNativeModule.kt`
  - `SunnyService.kt` (onDestroy hides the bubble)
  - `AndroidManifest.xml` (`SYSTEM_ALERT_WINDOW`)
  - `apps/mobile/modules/daily-native/index.ts`

**Interfaces:**
- Produces native functions on `DailyNativeApi`:
  - `canDrawOverlays(): boolean`
  - `openOverlaySettings(): void`
  - `updateBubble(visible: boolean, mood: string): void`
  - `showBubbleSpeech(title: string, body: string): void`
  - `takeBubbleActions(): string[]`
  - `bubbleHiddenDay(): string | null`
- Produces Kotlin pure helpers, tested by JUnit:
  - `Bubble.snapX(x: Int, size: Int, screenW: Int): Int`
  - `Bubble.isTap(dxPx: Float, dyPx: Float, ms: Long, slopPx: Float): Boolean`

- [ ] **Step 1: Write the failing JUnit test**

`BubbleTest.kt`:

```kotlin
package expo.modules.dailynative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BubbleTest {
  @Test fun snapsToTheNearestSide() {
    assertEquals(0, Bubble.snapX(100, 160, 1080))
    assertEquals(920, Bubble.snapX(700, 160, 1080))
    assertEquals(0, Bubble.snapX(-50, 160, 1080))
  }

  @Test fun tellsATapFromADrag() {
    assertTrue(Bubble.isTap(3f, 2f, 150, 24f))
    assertFalse(Bubble.isTap(40f, 0f, 150, 24f))
    assertFalse(Bubble.isTap(0f, 0f, 700, 24f)) // that's a long press
  }
}
```

Run `./gradlew.bat :daily-native:testDebugUnitTest` from `apps/mobile/android`. It fails because `Bubble` is missing.

- [ ] **Step 2: Implement `Bubble.kt`**

`Bubble` is a singleton `object` that holds two overlay views, added with `WindowManager` using `TYPE_APPLICATION_OVERLAY`, `FLAG_NOT_FOCUSABLE` and `FLAG_LAYOUT_NO_LIMITS`, with gravity `TOP or START`.

**Bubble view:**
- An `ImageView` showing `R.drawable.sunny_<mood>` from M3's PNGs.
- 66 dp, a circular white background with 4 dp padding and 6 dp elevation.
- `contentDescription` "Sunny".
- Its position is saved in SharedPreferences `daily_bubble` (`x`, `y`), defaulting to the right edge at 40 % of the screen height.

**Touch:**
- `ACTION_DOWN` remembers the start point and time, and posts a 500 ms long-press runnable.
- `ACTION_MOVE` past the touch slop cancels the long press and moves the window.
- `ACTION_UP`:
  - A tap (`isTap`) launches `packageManager.getLaunchIntentForPackage(packageName)` with `FLAG_ACTIVITY_NEW_TASK`.
  - Otherwise, animate x to `snapX` with a 250 ms `ValueAnimator` and an overshoot interpolator, then save the position.
- A long press shows a small `PopupMenu` anchored to the bubble with one item, "Hide for today". Choosing it saves `hidden_day` = today (`yyyy-MM-dd`, local) and hides the bubble.

**Speech view:**
- A white rounded card (16 dp radius, max width 240 dp) placed beside the bubble, on the side away from the edge.
- It holds a bold title, a body, and two text buttons: "Thanks" (dismiss) and "Snooze 1 h".
- "Snooze 1 h" appends `"snooze"` to the prefs string set `actions` and dismisses.
- The card auto-hides after 12 s.

**Functions** (each posts to the main looper and catches everything):
- `update(ctx, visible, mood)`:
  - Shows or hides the bubble; it never shows when `!Settings.canDrawOverlays(ctx)`.
  - Swaps the image when the mood changes.
  - Never shows on `hidden_day` == today.
- `speak(ctx, title, body)`: only while the bubble is shown.
- `hide(ctx)`
- `takeActions(ctx): List<String>`: returns and clears the actions.
- `hiddenDay(ctx): String?`

Pure helpers:

```kotlin
  fun snapX(x: Int, size: Int, screenW: Int): Int = if (x + size / 2 < screenW / 2) 0 else screenW - size
  fun isTap(dxPx: Float, dyPx: Float, ms: Long, slopPx: Float): Boolean = ms < 500 && dxPx * dxPx + dyPx * dyPx <= slopPx * slopPx
```

**Module wiring:**
- In `DailyNativeModule.kt`, add `Function("canDrawOverlays") { Settings.canDrawOverlays(context) }`.
- `openOverlaySettings` starts `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` with `Uri.parse("package:" + context.packageName)` and `FLAG_ACTIVITY_NEW_TASK`. On `ActivityNotFoundException` it falls back to `Settings.ACTION_SETTINGS`.
- Add `updateBubble`, `showBubbleSpeech`, `takeBubbleActions` and `bubbleHiddenDay`, delegating to `Bubble`.

**Elsewhere:**
- `SunnyService.onDestroy` calls `Bubble.hide(applicationContext)`.
- Manifest: add `<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />`.
- `index.ts`: add the six functions to `DailyNativeApi`.

- [ ] **Step 3: Run JUnit, typecheck and a device check**

Run JUnit (2 new tests passing) and `pnpm --filter @worksight/mobile typecheck`.

Rebuild the dev client on the emulator. Grant overlay access with `adb shell appops set com.aaronalex.daily SYSTEM_ALERT_WINDOW allow`. Then use a temporary debug call to `DailyNative.updateBubble(true, 'happy')` and check that:
- the bubble appears over the home screen;
- it drags and snaps to a side;
- a tap opens Daily;
- a long press then "Hide for today" hides it, and a further `updateBubble(true, …)` keeps it hidden;
- `showBubbleSpeech('Time to wind down', 'Sunny’s getting sleepy.')` shows the card;
- "Snooze 1 h" makes `takeBubbleActions()` return `['snooze']` once.

Clear `hidden_day` with `adb shell run-as com.aaronalex.daily rm shared_prefs/daily_bubble.xml`. Save screenshots, and remove the temporary code.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/modules
git commit -m "feat(mobile): floating Sunny bubble overlay with speech, drag, snap and hide for today

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The bubble in the app: when it shows, nudges through it, and the Settings switch

**Files:**
- Create: `apps/mobile/src/sunny/bubble.ts`
- Modify:
  - `apps/mobile/src/coach/coach.ts`
  - `apps/mobile/src/sunny/minuteTask.ts`
  - `apps/mobile/app/settings/index.tsx`
  - `apps/mobile/app/_layout.tsx` (hide while Daily is open)
  - `apps/mobile/src/db/settings.ts`
- Test: `apps/mobile/src/sunny/bubble.test.ts`, `apps/mobile/src/coach/coach.test.ts`

**Interfaces:**
- Consumes: Task 7's native functions and `isPlus` (Task 4).
- Produces:
  - `bubbleShows(i: { plus: boolean; on: boolean; serviceOn: boolean; canDraw: boolean; hiddenDay: string | null; today: string; appActive: boolean; openAndroidCategory: number | null }): boolean`
  - `coachTick(db, notifier, nowMs, inCall = false, speak?: (title: string, body: string) => void)`
  - settings key `bubble` ('0')

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/sunny/bubble.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bubbleShows } from './bubble';

const base = { plus: true, on: true, serviceOn: true, canDraw: true, hiddenDay: null, today: '2026-10-08', appActive: false, openAndroidCategory: 4 };

describe('bubbleShows (spec §9.5)', () => {
  it('shows for Plus with the switch on, the service running and overlay access', () => {
    expect(bubbleShows(base)).toBe(true);
    for (const off of [{ plus: false }, { on: false }, { serviceOn: false }, { canDraw: false }]) expect(bubbleShows({ ...base, ...off })).toBe(false);
  });

  it('hides over games and video, over Daily itself, and for the rest of a hidden day (Review Focus 5)', () => {
    expect(bubbleShows({ ...base, openAndroidCategory: 0 })).toBe(false); // GAME
    expect(bubbleShows({ ...base, openAndroidCategory: 2 })).toBe(false); // VIDEO
    expect(bubbleShows({ ...base, appActive: true })).toBe(false);
    expect(bubbleShows({ ...base, hiddenDay: '2026-10-08' })).toBe(false);
    expect(bubbleShows({ ...base, hiddenDay: '2026-10-07' })).toBe(true);
    expect(bubbleShows({ ...base, openAndroidCategory: null })).toBe(true);
  });
});
```

Add to `coach.test.ts`, reusing the file's stretch setup with Instagram open for 31 minutes:

```ts
  it('speaks through the bubble instead of a notification when it is showing (spec §9.4)', async () => {
    // same setup as the first stretch test
    const n = new FakeNotifier();
    const said: string[] = [];
    expect(await coachTick(db, n, at(20, 31), false, (title) => said.push(title))).toBe('stretch');
    expect(said).toEqual(['31 minutes on Instagram']);
    expect(n.coach).toEqual([]);
  });
```

Run them. They fail because `bubble.ts` is missing and `coachTick` has no speak parameter.

- [ ] **Step 2: Implement**

`bubble.ts`:

```ts
const GAME = 0;
const VIDEO = 2; // Android ApplicationInfo categories (spec §9.5: hidden while a full-screen app is in front)

export function bubbleShows(i: {
  plus: boolean; on: boolean; serviceOn: boolean; canDraw: boolean; hiddenDay: string | null; today: string; appActive: boolean; openAndroidCategory: number | null;
}): boolean {
  if (!i.plus || !i.on || !i.serviceOn || !i.canDraw || i.appActive) return false;
  if (i.hiddenDay === i.today) return false;
  // ponytail: games/videos stand in for "full screen" — Android won't say whether another app is immersive.
  return i.openAndroidCategory !== GAME && i.openAndroidCategory !== VIDEO;
}
```

`coach.ts`: add the `speak` parameter. When it is given and the nudge is planned, call `speak(nudge.title, nudge.body)` instead of `canNotify` + `showCoach`. Record the key the same way.

`minuteTask.ts`:
1. Before `coachTick`, apply the bubble's actions: `for (const a of DailyNative.takeBubbleActions()) if (a === 'snooze') setSetting(db, 'coach_snooze_until', now + COACH_SNOOZE_MS);`. Import `COACH_SNOOZE_MS` from `../coach/actions`. Wrap this in try/catch.
2. Compute `shows = bubbleShows({ ... })` with:
   - `plus: isPlus(db, now)`
   - `on: getSetting(db, 'bubble') === '1'`
   - `serviceOn: getSetting(db, 'sunny_service') === '1'`
   - `canDraw: DailyNative.canDrawOverlays()`
   - `hiddenDay: DailyNative.bubbleHiddenDay()`
   - `today: localDate(now)`
   - `appActive: AppState.currentState === 'active'`
   - `openAndroidCategory`: the open app's `android_category` from the `apps` row for `loadState(db).openPkg`, or null
3. Pass `shows ? (t, b) => DailyNative.showBubbleSpeech(t, b) : undefined` as `coachTick`'s fifth argument.
4. After the chip update, call `DailyNative.updateBubble(shows, v.mood)`.
5. Wrap each native call so one failure doesn't stop the task.

`app/_layout.tsx` `Gate`: when AppState becomes `active`, call `DailyNative.updateBubble(false, 'happy')` inside try/catch. Daily hides its own bubble, and the next minute task brings it back when the app is left.

`settings.ts`: add `bubble: '0'` to DEFAULTS.

`app/settings/index.tsx`, Sunny group: after the status-bar row, add the "Floating Sunny" row with a PLUS pill and a `Switch`.
- **Not Plus:** turning it on pushes `/paywall` and leaves the switch off.
- **Plus:** turning it on saves `bubble` '1' and, if `!DailyNative.canDrawOverlays()`, calls `DailyNative.openOverlaySettings()`. Turning it off saves '0' and calls `DailyNative.updateBubble(false, 'happy')`.
- **Hint row:** while `bubble` is '1' and overlay access is missing, re-check on focus and on AppState active, the same pattern as the M4 notifications hint. Show "Daily needs “Display over other apps” to show Sunny." with an "Allow" button that calls `openOverlaySettings`.
- **Sunny off:** while the Sunny status-bar switch is off, the Floating Sunny row is disabled at 0.4 opacity, with "Needs Sunny in the status bar" on the right.

- [ ] **Step 3: Run the tests, typecheck and a device check**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`.

On the emulator, with the fake Plus trial from Task 5:
- turning the Floating Sunny switch on asks for overlay access;
- after allowing it and leaving Daily, the bubble appears within a minute;
- opening Daily hides it;
- a seeded long-stretch nudge appears as Sunny's speech card;
- "Snooze 1 h" stops nudges, so `coach_snooze_until` is set after the next minute;
- ending the fake Plus (set `plus_until` 0 with a temporary line) makes the bubble disappear within a minute (Review Focus 4).

Save screenshots.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src apps/mobile/app
git commit -m "feat(mobile): floating Sunny shows by rule, speaks nudges, Settings switch with overlay permission

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Phase check and the go-live checklist

**Files:**
- Create: `docs/superpowers/plans/2026-10-08-daily-m5-checklist.md`

- [ ] **Step 1: Full test run and builds**

Run:
- `pnpm test`
- `pnpm --filter @worksight/daily-ai typecheck`
- `pnpm --filter @worksight/web build`
- `npx electron-vite build` from `apps/consumer`
- JUnit (`./gradlew.bat :daily-native:testDebugUnitTest`)

If a desktop suite fails only on the `better_sqlite3` ABI, run `pnpm --filter @worksight/consumer pretest` and retry. Never kill `Daylens.exe`.
Expected: all green. Report the counts for each workspace.

- [ ] **Step 2: Write the checklist**

`docs/superpowers/plans/2026-10-08-daily-m5-checklist.md`:

```markdown
# Daily M5: Daily Plus checklist

## A. On the emulator now (debug build, no keys, so the fake billing is used)
- [ ] Settings → Daily Plus · Try 7 days free opens the paywall; the screen matches the "Daily Plus paywall" mockup
- [ ] Yearly is picked first with SAVE 37% and the trial timeline; picking monthly changes the day-7 label and the fine print
- [ ] "Start 7-day free trial" closes the paywall; the Report tab now has Rewrite; Settings shows "Your subscription · Day 1 of 7 · Yearly plan"
- [ ] Your subscription matches the mockup: trial bar, Today rows (story, rewrites left, week sentence), Manage in Google Play, Restore
- [ ] The Report "See Daily Plus" and Week "Daily Plus writes this for you" upsells show only when not on Plus
- [ ] Floating Sunny: the switch asks for overlay access; the bubble appears outside Daily within a minute, hides while Daily is open, drags and snaps, tap opens Daily, long-press → Hide for today keeps it away until tomorrow
- [ ] A coach nudge arrives as Sunny's speech card while the bubble shows; "Snooze 1 h" silences nudges

## B. Go live (needs your accounts; do once, in this order)

1. **Supabase**: create a project "daily" (region near India).
   - Authentication → Sign In / Providers → turn on **Anonymous sign-ins**.
   - From the repo root:
     - `supabase init --workdir supabase-daily` (once)
     - `supabase link --workdir supabase-daily --project-ref <ref>`
     - `supabase db push --workdir supabase-daily`
2. **Google Play Console** ($25 one-time developer account):
   - Create the app `com.aaronalex.daily`.
   - Monetize → Subscriptions: create `plus_monthly` and `plus_yearly`.
   - Give each a base plan (monthly at $3.99 / yearly at $29.99, regional pricing on) and a **7-day free trial** offer for new customers.
   - Billing products only load for a build uploaded to a testing track. Upload a signed release AAB (`cd apps/mobile/android && ./gradlew.bat bundleRelease`; signing is set up in M6) to **Internal testing**, and add yourself as a licence tester.
3. **RevenueCat**:
   - Create a project.
   - Add an Android app with package `com.aaronalex.daily`, and upload the Play service-account JSON (RevenueCat's guide walks through it).
   - Import both products.
   - Create entitlement **plus** with both products attached.
   - Make the **default** offering's packages Monthly (`$rc_monthly` → plus_monthly) and Annual (`$rc_annual` → plus_yearly).
   - Copy the **public Android SDK key** (`goog_…`) and a **secret API key** (`sk_…`).
4. **Secrets**:
   - `supabase secrets set --workdir supabase-daily OPENROUTER_API_KEY=… REVENUECAT_SECRET=sk_…`
   - Copy the OpenRouter value yourself from `apps/consumer/.env`. Never paste it into chat or a file in the repo.
5. **Deploy**: `supabase functions deploy daily-ai --workdir supabase-daily`.
6. **App env**: in `apps/mobile/.env` (gitignored), set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`

   Remove `EXPO_PUBLIC_DAILY_AI_URL` so the app uses the deployed function. Rebuild.
7. **OpenRouter**: give the key a monthly credit limit in the OpenRouter dashboard.

## C. On your phone with the internal-testing build
- [ ] The paywall shows Play's real prices in your currency, and the trial only if your account hasn't had one
- [ ] Buy the trial with the licence tester account → Plus turns on; tonight's report is the written story
- [ ] Rewrite 3 times → the 4th says "You've used today's rewrites"
- [ ] In Play, cancel the subscription → it stays on until the period ends, and Your subscription says "ends …"
- [ ] Airplane mode with Plus → still Plus until it ends; nothing crashes
- [ ] Delete everything, then Restore purchases → Plus comes back
- [ ] curl the function with only the anon key → 401; with a free user's token → not_plus
- [ ] Floating Sunny over Instagram shows; over YouTube or a game it hides within a minute
- [ ] Still open from M2–M4: run those checklists on this build
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-10-08-daily-m5-checklist.md
git commit -m "docs: Daily M5 checklist and go-live steps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
