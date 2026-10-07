import DailyNative, { type GoogleSignInResult } from '../../modules/daily-native';
import { resyncPlus } from '../plus/start';
import { supabase } from '../plus/supabase';

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
    const { data } = await sb.auth.getSession();
    if (data.session) {
      const { error } = await sb.auth.linkIdentity(cred);
      if (!error) return 'linked';
      if (error.code !== 'identity_already_exists' && error.code !== 'email_exists') return failure(error);
    }
    const { error } = await sb.auth.signInWithIdToken(cred);
    if (error) return failure(error);
    await resyncPlus(); // RevenueCat logs in as the (other) user, so Plus follows the account
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
  const g = data.session?.user.identities?.find((i) => i.provider === 'google')?.identity_data;
  if (!g) return null;
  return { email: text(g.email), name: text(g.full_name) ?? text(g.name), photoUrl: text(g.avatar_url) ?? text(g.picture) };
}

/** Local data stays. Plus stays with the Google account; this phone goes back to a fresh anonymous user. */
export async function signOut(): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  await sb.auth.signOut({ scope: 'local' });
  await resyncPlus(); // ensureUserId makes the new anonymous user; billing logs in as it
}

export const firstName = (a: Account | null) => a?.name?.split(' ')[0] || a?.email || 'Google';
