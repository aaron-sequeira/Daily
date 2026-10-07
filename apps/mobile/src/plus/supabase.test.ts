import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { getSession: vi.fn(), signInAnonymously: vi.fn() };
vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth }) }));
vi.stubGlobal('localStorage', {});

const load = async (env = true) => {
  vi.resetModules();
  if (env) { process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon'; }
  else { delete process.env.EXPO_PUBLIC_SUPABASE_URL; delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY; }
  return import('./supabase');
};

describe('anonymous identity', () => {
  beforeEach(() => { auth.getSession.mockReset(); auth.signInAnonymously.mockReset(); });
  afterEach(() => { delete process.env.EXPO_PUBLIC_SUPABASE_URL; delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY; vi.restoreAllMocks(); });

  it('returns the existing session id without signing in', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' }, access_token: 't' } }, error: null });
    const m = await load();
    expect(await m.ensureUserId()).toBe('u1');
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    expect(await m.accessToken()).toBe('t');
  });

  it('signs in once when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.signInAnonymously.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    const m = await load();
    expect(await m.ensureUserId()).toBe('u2');
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('two simultaneous callers create one user', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.signInAnonymously.mockImplementation(async () => { await Promise.resolve(); return { data: { user: { id: 'u3' } }, error: null }; });
    const m = await load();
    expect(await Promise.all([m.ensureUserId(), m.ensureUserId()])).toEqual(['u3', 'u3']);
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('a getSession error returns null and never signs in', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new Error('refresh failed') });
    const m = await load();
    expect(await m.ensureUserId()).toBeNull();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    expect(await m.accessToken()).toBeNull();
  });

  it('without env there is no client and no user', async () => {
    const m = await load(false);
    expect(m.supabase()).toBeNull();
    expect(await m.ensureUserId()).toBeNull();
  });
});
