import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { FakeNotifier } from '../reminders/fakeNotifier';
import { deleteEverything } from '../settings/data';
import { NO_ENTITLEMENT, type Billing, type Entitlement } from './billing';
import { saveEntitlement } from './entitlement';
import { isPlus } from './plus';
import { linkUser, plusAfterUserChange, resetPlusForTests, resyncPlus, startPlus } from './start';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const DAY = 86_400_000;

describe('saveEntitlement', () => {
  it('caches Plus until it ends and reminds two days before a trial ends', async () => {
    const db = await makeTestDb();
    const n = new FakeNotifier();
    await saveEntitlement(db, { active: true, untilMs: NOW + 7 * DAY, plan: 'yearly', trial: true, willRenew: true }, n, NOW);
    expect(getSetting(db, 'plus_until')).toBe(String(NOW + 7 * DAY));
    expect(isPlus(db, NOW)).toBe(true);
    expect(isPlus(db, NOW + 7 * DAY + 1)).toBe(true); // renewing: the renewal may reach the phone late
    expect(isPlus(db, NOW + 10 * DAY + 1)).toBe(false); // offline, past the end and the 3-day renewal grace (Review Focus 4)
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

function billingStub(initial: Entitlement, opts: { logInFails?: boolean } = {}) {
  const calls = { start: [] as (string | null)[], logIn: [] as string[] };
  let cb: ((e: Entitlement) => void) | null = null;
  let ent: Entitlement | null = initial; // null: the store can't be reached
  const now = () => { if (!ent) throw new Error('offline'); return ent; };
  const billing: Billing = {
    async start() { calls.start.push(null); },
    async logIn(id) { calls.logIn.push(id); if (opts.logInFails) throw new Error('offline'); },
    async offers() { return []; },
    async purchase() { return { ok: true, ent: now() }; },
    async restore() { return now(); },
    async entitlement() { return now(); },
    onChange(f) { cb = f; return () => { cb = null; }; },
    manageUrl() { return ''; }
  };
  return { billing, calls, fire: (e: Entitlement) => cb!(e), set: (e: Entitlement | null) => { ent = e; } };
}

describe('startPlus', () => {
  beforeEach(() => resetPlusForTests());

  it('saves the entitlement billing reports, then follows later changes', async () => {
    const db = await makeTestDb();
    const n = new FakeNotifier();
    const until = Date.now() + 30 * DAY;
    const s = billingStub({ active: true, untilMs: until, plan: 'monthly', trial: false, willRenew: true });
    await startPlus(db, { ensureUserId: async () => 'u1', billing: s.billing, notifier: n });
    expect(s.calls.start).toHaveLength(1);
    expect(s.calls.logIn).toEqual(['u1']);
    expect(getSetting(db, 'plus_until')).toBe(String(until));
    s.fire(NO_ENTITLEMENT);
    await new Promise((r) => setTimeout(r, 0));
    expect(getSetting(db, 'plus_until')).toBe('0');
  });

  it('starts billing anonymously when there is no user id', async () => {
    const db = await makeTestDb();
    const s = billingStub(NO_ENTITLEMENT);
    await startPlus(db, { ensureUserId: async () => null, billing: s.billing, notifier: new FakeNotifier() });
    expect(s.calls.start).toHaveLength(1);
    expect(s.calls.logIn).toEqual([]);
  });

  it('configures billing before the sign-in resolves, so a stalled sign-in never leaves it unconfigured', async () => {
    const db = await makeTestDb();
    const s = billingStub(NO_ENTITLEMENT);
    let signIn!: (id: string | null) => void;
    const run = startPlus(db, { ensureUserId: () => new Promise((r) => { signIn = r; }), billing: s.billing, notifier: new FakeNotifier() });
    await new Promise((r) => setTimeout(r, 0));
    expect(s.calls.start).toHaveLength(1);
    expect(s.calls.logIn).toEqual([]);
    signIn('u1');
    await run;
    expect(s.calls.logIn).toEqual(['u1']);
  });

  it('keeps listening for changes even when logIn fails', async () => {
    const db = await makeTestDb();
    const s = billingStub(NO_ENTITLEMENT, { logInFails: true });
    await startPlus(db, { ensureUserId: async () => 'u1', billing: s.billing, notifier: new FakeNotifier() });
    const until = Date.now() + 30 * DAY;
    s.fire({ active: true, untilMs: until, plan: 'yearly', trial: false, willRenew: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(getSetting(db, 'plus_until')).toBe(String(until));
  });
});

describe('linkUser and resyncPlus', () => {
  beforeEach(() => resetPlusForTests());
  afterEach(() => { vi.restoreAllMocks(); });

  it('logs billing in with the signed-in user, and skips logIn without one or when it fails', async () => {
    const s = billingStub(NO_ENTITLEMENT);
    await linkUser({ billing: s.billing, ensureUserId: async () => null });
    expect(s.calls.logIn).toEqual([]);
    await linkUser({ billing: s.billing, ensureUserId: async () => 'u1' });
    expect(s.calls.logIn).toEqual(['u1']);
    const failing = billingStub(NO_ENTITLEMENT, { logInFails: true });
    await expect(linkUser({ billing: failing.billing, ensureUserId: async () => 'u1' })).resolves.toBeUndefined();
  });

  it('saves what billing reports now (resume, Delete everything, a server not_plus), once at a time, never throwing', async () => {
    const db = await makeTestDb();
    const s = billingStub(NO_ENTITLEMENT);
    await resyncPlus(); // before startPlus: nothing configured yet, nothing saved
    expect(s.calls.logIn).toEqual([]);
    await startPlus(db, { ensureUserId: async () => 'u1', billing: s.billing, notifier: new FakeNotifier() });
    const until = Date.now() + 30 * DAY;
    s.set({ active: true, untilMs: until, plan: 'yearly', trial: false, willRenew: true });
    await Promise.all([resyncPlus(), resyncPlus()]);
    expect(getSetting(db, 'plus_until')).toBe(String(until));
    expect(s.calls.logIn).toEqual(['u1', 'u1']); // startPlus, then one shared resync
    s.set(null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(resyncPlus()).resolves.toBeUndefined();
    expect(getSetting(db, 'plus_until')).toBe(String(until)); // offline: the last known entitlement stays
  });

  it('brings Plus and the trial reminder back after Delete everything', async () => {
    const db = await makeTestDb();
    const n = new FakeNotifier();
    const until = Date.now() + 6 * DAY;
    const s = billingStub({ active: true, untilMs: until, plan: 'yearly', trial: true, willRenew: true });
    await startPlus(db, { ensureUserId: async () => 'u1', billing: s.billing, notifier: n });
    deleteEverything(db, Date.now());
    await n.cancelTrialReminder(); // Delete everything cancels every scheduled notification
    expect(isPlus(db)).toBe(false);
    await resyncPlus();
    expect(isPlus(db)).toBe(true);
    expect(n.trialReminder).toMatchObject({ atMs: until - 2 * DAY });
  });
});

describe('plusAfterUserChange', () => {
  beforeEach(() => resetPlusForTests());

  it('a resync that began as the old user finishes first, so billing ends on the new user', async () => {
    const db = await makeTestDb();
    const s = billingStub(NO_ENTITLEMENT);
    let user = 'anon';
    const landed: string[] = [];
    // logIn as the old user is slow (it began first, e.g. the resume after the Google sheet closed)
    s.billing.logIn = async (id) => { await new Promise((r) => setTimeout(r, id === 'anon' ? 20 : 0)); landed.push(id); };
    await startPlus(db, { ensureUserId: async () => user, billing: s.billing, notifier: new FakeNotifier() });
    const stale = resyncPlus();
    user = 'google';
    await plusAfterUserChange(false);
    await stale;
    expect(landed.at(-1)).toBe('google');
  });

  it('with restore, this phone’s Play purchase follows the new user', async () => {
    const db = await makeTestDb();
    const until = Date.now() + 30 * DAY;
    const s = billingStub(NO_ENTITLEMENT);
    s.billing.restore = async () => ({ active: true, untilMs: until, plan: 'yearly', trial: false, willRenew: true });
    await startPlus(db, { ensureUserId: async () => 'google', billing: s.billing, notifier: new FakeNotifier() });
    expect(isPlus(db)).toBe(false);
    await plusAfterUserChange(true);
    expect(isPlus(db)).toBe(true);
  });
});
