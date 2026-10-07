import { beforeEach, describe, expect, it } from 'vitest';
import { getSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { FakeNotifier } from '../reminders/fakeNotifier';
import { NO_ENTITLEMENT, type Billing, type Entitlement } from './billing';
import { saveEntitlement } from './entitlement';
import { isPlus } from './plus';
import { resetPlusForTests, startPlus } from './start';

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

function billingStub(ent: Entitlement, opts: { logInFails?: boolean } = {}) {
  const calls = { start: [] as (string | null)[], logIn: [] as string[] };
  let cb: ((e: Entitlement) => void) | null = null;
  const billing: Billing = {
    async start() { calls.start.push(null); },
    async logIn(id) { calls.logIn.push(id); if (opts.logInFails) throw new Error('offline'); },
    async offers() { return []; },
    async purchase() { return { ok: true, ent }; },
    async restore() { return ent; },
    async entitlement() { return ent; },
    onChange(f) { cb = f; return () => { cb = null; }; },
    manageUrl() { return ''; }
  };
  return { billing, calls, fire: (e: Entitlement) => cb!(e) };
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
