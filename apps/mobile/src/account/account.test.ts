import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { getSession: vi.fn(), linkIdentity: vi.fn(), signInWithIdToken: vi.fn(), signOut: vi.fn() };
const googleSignIn = vi.fn();
const plusAfterUserChange = vi.fn();
const ensureUserId = vi.fn();
vi.mock('../plus/supabase', () => ({ supabase: () => ({ auth }), ensureUserId: () => ensureUserId() }));
vi.mock('../plus/start', () => ({ plusAfterUserChange: (restore: boolean) => plusAfterUserChange(restore) }));
vi.mock('../../modules/daily-native', () => ({ default: { googleSignIn: (id: string) => googleSignIn(id) } }));

import { account, firstName, signInWithGoogle, signOut } from './account';

const token = { idToken: 'tok', rawNonce: 'raw', email: 'a@b.c', name: 'Asha Rao', photoUrl: null };
const cred = { provider: 'google', token: 'tok', nonce: 'raw' };
const anon = { data: { session: { user: { id: 'anon', identities: [] } } }, error: null };
const coded = (code: string) => Object.assign(new Error(code), { code });

describe('signInWithGoogle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web.apps.googleusercontent.com';
    googleSignIn.mockResolvedValue(token);
    ensureUserId.mockResolvedValue('anon');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('links Google to the current user, keeping its id', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null });
    expect(await signInWithGoogle()).toBe('linked');
    expect(googleSignIn).toHaveBeenCalledWith('web.apps.googleusercontent.com');
    expect(auth.linkIdentity).toHaveBeenCalledWith(cred);
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(plusAfterUserChange).not.toHaveBeenCalled();
  });

  it('identity exists → switches to that user and moves Plus (restoring this phone’s purchase)', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: { code: 'identity_already_exists', name: 'AuthApiError' } });
    auth.signInWithIdToken.mockResolvedValue({ data: {}, error: null });
    expect(await signInWithGoogle()).toBe('switched');
    expect(auth.signInWithIdToken).toHaveBeenCalledWith(cred);
    expect(plusAfterUserChange).toHaveBeenCalledWith(true);
  });

  it('no anonymous user (offline at launch, or anonymous sign-ins off) → signs in with the token directly', async () => {
    ensureUserId.mockResolvedValue(null);
    auth.signInWithIdToken.mockResolvedValue({ data: {}, error: null });
    expect(await signInWithGoogle()).toBe('switched');
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    expect(plusAfterUserChange).toHaveBeenCalledWith(true);
  });

  it.each(['cancelled', 'no_account'])('passes %s through without touching Supabase', async (code) => {
    googleSignIn.mockRejectedValue(coded(code));
    expect(await signInWithGoogle()).toBe(code);
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it('any other native error is failed', async () => {
    googleSignIn.mockRejectedValue(coded('failed'));
    expect(await signInWithGoogle()).toBe('failed');
  });

  it('offline at link time', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: { name: 'AuthRetryableFetchError', status: 0 } });
    expect(await signInWithGoogle()).toBe('offline');
  });

  it('a thrown fetch error is offline', async () => {
    auth.linkIdentity.mockRejectedValue(new TypeError('Network request failed'));
    expect(await signInWithGoogle()).toBe('offline');
  });

  it('a rejected switch is failed and does not resync', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: { code: 'identity_already_exists', name: 'AuthApiError' } });
    auth.signInWithIdToken.mockResolvedValue({ data: {}, error: { code: 'bad_jwt', name: 'AuthApiError' } });
    expect(await signInWithGoogle()).toBe('failed');
    expect(plusAfterUserChange).not.toHaveBeenCalled();
  });

  it('without a Web client id it fails before showing the sheet', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    expect(await signInWithGoogle()).toBe('failed');
    expect(googleSignIn).not.toHaveBeenCalled();
  });
});

describe('account and signOut', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('reads the Google identity', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u', identities: [
      { provider: 'anonymous', identity_data: {} },
      { provider: 'google', identity_data: { email: 'a@b.c', full_name: 'Asha Rao', avatar_url: 'https://x/p.png' } }
    ] } } }, error: null });
    expect(await account()).toEqual({ email: 'a@b.c', name: 'Asha Rao', photoUrl: 'https://x/p.png' });
  });

  it('an anonymous user has no account', async () => {
    auth.getSession.mockResolvedValue(anon);
    expect(await account()).toBeNull();
  });

  it('signOut clears the local session, then billing follows the fresh anonymous user', async () => {
    auth.signOut.mockResolvedValue({ error: null });
    expect(await signOut()).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(plusAfterUserChange).toHaveBeenCalledWith(false);
  });

  it('signOut offline keeps the account and says so', async () => {
    auth.signOut.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    expect(await signOut()).toBe('You’re offline. Try again when you’re connected.');
    expect(plusAfterUserChange).not.toHaveBeenCalled();
  });

  it('any other signOut error keeps the account', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    auth.signOut.mockResolvedValue({ error: { name: 'AuthApiError', status: 500 } });
    expect(await signOut()).toBe('Couldn’t sign out. Try again.');
    expect(plusAfterUserChange).not.toHaveBeenCalled();
  });

  it('firstName', () => {
    expect(firstName({ email: 'a@b.c', name: 'Asha Rao', photoUrl: null })).toBe('Asha');
    expect(firstName({ email: 'a@b.c', name: null, photoUrl: null })).toBe('a@b.c');
    expect(firstName(null)).toBe('Google');
  });
});
