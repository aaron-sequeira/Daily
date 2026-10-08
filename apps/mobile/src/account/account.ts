import DailyNative, { type GoogleSignInResult } from '../../modules/daily-native';
import { plusAfterUserChange } from '../plus/start';
import { ensureUserId, supabase } from '../plus/supabase';

export type SignInResult = 'linked' | 'switched' | 'cancelled' | 'no_account' | 'offline' | 'failed';
export type Account = { email: string | null; name: string | null; photoUrl: string | null };

export const SIGN_IN_MESSAGE: Partial<Record<SignInResult, string>> = {
  no_account: 'Add a Google account in your phone’s settings first.',
  offline: 'You’re offline. You can sign in later in Settings.',
  failed: 'Couldn’t sign in. Try again or skip for now.'
};

export const signedIn = (r: SignInResult) => r === 'linked' || r === 'switched';

type AuthError = { name?: string; code?: string } | null;
const isOffline = (e: unknown) => e instanceof TypeError || (e as AuthError)?.name === 'AuthRetryableFetchError';
const failure = (e: unknown): SignInResult => {
  if (isOffline(e)) return 'offline';
  console.warn('daily: Google sign-in failed', (e as AuthError)?.code ?? e);
  return 'failed';
};

/** Spec: link Google to the current (anonymous) user, so its id and with it Plus, quotas and RevenueCat stay the same.
 * A Google account already on Daily (reinstall, second phone) switches to that user instead, and Plus follows it. */
export async function signInWithGoogle(): Promise<SignInResult> {
  const sb = supabase();
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
  if (!sb || !clientId) return 'failed';
  let g: GoogleSignInResult;
  try {
    g = await DailyNative.googleSignIn(clientId);
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code === 'cancelled' || code === 'no_account' ? code : failure(e);
  }
  const cred = { provider: 'google', token: g.idToken, nonce: g.rawNonce };
  try {
    // ensureUserId, not getSession: it joins an anonymous sign-up already in flight (the resume after the sheet closes
    // starts one), so that sign-up can't land after ours and overwrite the Google session.
    if (await ensureUserId()) {
      const { error } = await sb.auth.linkIdentity(cred);
      if (!error) {
        // The session the link returns describes the user as it was before the link (no Google identity, still
        // anonymous), so account() would see no one. A refresh stores the user as it is now; if it fails, the next
        // automatic refresh fixes it.
        await sb.auth.refreshSession();
        return 'linked';
      }
      if (error.code !== 'identity_already_exists' && error.code !== 'email_exists') return failure(error);
    }
    const { error } = await sb.auth.signInWithIdToken(cred);
    if (error) return failure(error);
    await plusAfterUserChange(true); // RevenueCat logs in as the (other) user, so Plus follows the account
    return 'switched';
  } catch (e) {
    return failure(e);
  }
}

const text = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** The signed-in Google account, or null for an anonymous user. */
export async function account(): Promise<Account | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const ids = data.session?.user.identities ?? [];
  const g = ids.find((i) => i.provider === 'google')?.identity_data;
  if (g) return { email: text(g.email), name: text(g.full_name) ?? text(g.name), photoUrl: text(g.avatar_url) ?? text(g.picture) };
  const e = ids.find((i) => i.provider === 'email')?.identity_data;
  return e ? { email: text(e.email), name: text(data.session?.user.user_metadata?.full_name), photoUrl: null } : null;
}

export type EmailSignInResult = 'switched' | 'wrong' | 'unconfirmed' | 'offline' | 'failed';
export const EMAIL_SIGN_IN_MESSAGE: Record<Exclude<EmailSignInResult, 'switched'>, string> = {
  wrong: 'That email and password don’t match.',
  unconfirmed: 'Confirm your email first. We’ve sent you a new code.',
  offline: 'You’re offline. Try again when you’re connected.',
  failed: 'Couldn’t sign in. Try again.'
};

/** Signs in to an existing email account (no sign-up in the app yet) and switches to it, like a Google account that is
 * already on Daily: Plus follows the account. */
export async function signInWithEmail(email: string, password: string): Promise<EmailSignInResult> {
  const sb = supabase();
  const address = email.trim().toLowerCase();
  if (!address || !password) return 'wrong';
  if (!sb) return 'failed';
  try {
    const { error } = await sb.auth.signInWithPassword({ email: address, password });
    if (error) {
      if (error.code === 'invalid_credentials') return 'wrong';
      if (error.code === 'email_not_confirmed') return 'unconfirmed';
      return failure(error) === 'offline' ? 'offline' : 'failed';
    }
    await plusAfterUserChange(true);
    return 'switched';
  } catch (e) {
    return failure(e) === 'offline' ? 'offline' : 'failed';
  }
}

/** Local data stays. Plus stays with the Google account; this phone goes back to a fresh anonymous user.
 * Null when signed out; otherwise a message, and the account is still signed in (auth-js keeps the session when the
 * logout call fails, even offline). */
export async function signOut(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { error } = await sb.auth.signOut({ scope: 'local' });
  if (error) {
    if (isOffline(error)) return 'You’re offline. Try again when you’re connected.';
    console.warn('daily: sign out failed', error);
    return 'Couldn’t sign out. Try again.';
  }
  await plusAfterUserChange(false); // ensureUserId makes the new anonymous user; billing logs in as it
  return null;
}

export const firstName = (a: Account | null) => a?.name?.split(' ')[0] || a?.email || 'Google';
