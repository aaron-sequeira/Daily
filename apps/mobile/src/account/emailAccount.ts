import { plusAfterUserChange } from '../plus/start';
import { supabase } from '../plus/supabase';

/** Which email a 6-digit code came from: adding an email to this phone's (anonymous) user, a brand-new user, or a
 * password reset. The Supabase email templates must show {{ .Token }} for all three. */
export type CodeKind = 'link' | 'signup' | 'recovery';
export type StartResult = { status: 'code_sent'; kind: CodeKind } | { status: 'exists' | 'weak' | 'invalid' | 'rate' | 'offline' | 'failed' };
export type ConfirmResult = 'linked' | 'switched' | 'wrong_code' | 'weak' | 'offline' | 'failed';

export const MIN_PASSWORD = 8;
export const EMAIL_MESSAGE: Record<string, string> = {
  exists: 'That email already has an account. Sign in instead.',
  weak: `Use at least ${MIN_PASSWORD} characters for your password.`,
  invalid: 'That doesn’t look like an email address.',
  rate: 'Too many emails right now. Try again in a little while.',
  wrong_code: 'That code didn’t work. Check it, or send a new one.',
  offline: 'You’re offline. Try again when you’re connected.',
  failed: 'Something went wrong. Try again.'
};

type AuthError = { name?: string; code?: string } | null;
const clean = (email: string) => email.trim().toLowerCase();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isOffline = (e: unknown) => e instanceof TypeError || (e as AuthError)?.name === 'AuthRetryableFetchError';

function problem(e: unknown): 'exists' | 'weak' | 'invalid' | 'rate' | 'offline' | 'failed' {
  if (isOffline(e)) return 'offline';
  const code = (e as AuthError)?.code;
  if (code === 'email_exists' || code === 'user_already_exists') return 'exists';
  if (code === 'weak_password') return 'weak';
  if (code === 'validation_failed' || code === 'email_address_invalid') return 'invalid';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'rate';
  console.warn('daily: email account failed', code ?? e);
  return 'failed';
}

/** Create account. With an anonymous user on this phone (the usual case) the email is added to it, so its id, history and
 * Plus stay; the password is set after the code is confirmed. Without one, a new user is signed up. */
export async function startSignUp(email: string, password: string): Promise<StartResult> {
  const sb = supabase();
  const address = clean(email);
  if (!validEmail(address)) return { status: 'invalid' };
  if (password.length < MIN_PASSWORD) return { status: 'weak' };
  if (!sb) return { status: 'failed' };
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.user.is_anonymous) {
      const { error } = await sb.auth.updateUser({ email: address });
      return error ? { status: problem(error) } : { status: 'code_sent', kind: 'link' };
    }
    const { data: up, error } = await sb.auth.signUp({ email: address, password });
    if (error) return { status: problem(error) };
    // With confirmations on, Supabase answers an existing email with a user that has no identities instead of an error.
    if (up.user && up.user.identities?.length === 0) return { status: 'exists' };
    return { status: 'code_sent', kind: 'signup' };
  } catch (e) {
    return { status: problem(e) };
  }
}

export async function startPasswordReset(email: string): Promise<StartResult> {
  const sb = supabase();
  const address = clean(email);
  if (!validEmail(address)) return { status: 'invalid' };
  if (!sb) return { status: 'failed' };
  try {
    const { error } = await sb.auth.resetPasswordForEmail(address);
    return error ? { status: problem(error) } : { status: 'code_sent', kind: 'recovery' };
  } catch (e) {
    return { status: problem(e) };
  }
}

const OTP_TYPE = { link: 'email_change', signup: 'signup', recovery: 'recovery' } as const;

/** The 6-digit code from the email. 'linked' keeps this phone's user; 'switched' moved to another user (Plus follows). */
export async function confirmCode(kind: CodeKind, email: string, code: string, password: string): Promise<ConfirmResult> {
  const sb = supabase();
  const token = code.trim();
  if (!/^\d{6,8}$/.test(token)) return 'wrong_code';
  if (!sb) return 'failed';
  try {
    const { error } = await sb.auth.verifyOtp({ email: clean(email), token, type: OTP_TYPE[kind] });
    if (error) {
      const p = problem(error);
      return p === 'offline' || p === 'rate' ? (p === 'rate' ? 'failed' : 'offline') : 'wrong_code';
    }
    if (kind !== 'signup') {
      const { error: pw } = await sb.auth.updateUser({ password });
      if (pw) { const p = problem(pw); return p === 'weak' || p === 'offline' ? p : 'failed'; }
    }
    if (kind === 'link') {
      await sb.auth.refreshSession(); // the stored session still says "anonymous, no email"
      return 'linked';
    }
    await plusAfterUserChange(true);
    return 'switched';
  } catch (e) {
    return problem(e) === 'offline' ? 'offline' : 'failed';
  }
}

export async function resendCode(kind: CodeKind, email: string): Promise<'sent' | 'rate' | 'offline' | 'failed'> {
  const sb = supabase();
  if (!sb) return 'failed';
  try {
    const { error } = kind === 'recovery'
      ? await sb.auth.resetPasswordForEmail(clean(email))
      : await sb.auth.resend({ type: kind === 'link' ? 'email_change' : 'signup', email: clean(email) });
    if (!error) return 'sent';
    const p = problem(error);
    return p === 'rate' || p === 'offline' ? p : 'failed';
  } catch (e) {
    return problem(e) === 'offline' ? 'offline' : 'failed';
  }
}
