import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { getSession: vi.fn(), updateUser: vi.fn(), signUp: vi.fn(), verifyOtp: vi.fn(), resend: vi.fn(), refreshSession: vi.fn(), resetPasswordForEmail: vi.fn() };
const plusAfterUserChange = vi.fn();
vi.mock('../plus/supabase', () => ({ supabase: () => ({ auth }) }));
vi.mock('../plus/start', () => ({ plusAfterUserChange: (restore: boolean) => plusAfterUserChange(restore) }));

import { confirmCode, resendCode, startPasswordReset, startSignUp } from './emailAccount';

const anon = { data: { session: { user: { id: 'anon', is_anonymous: true } } }, error: null };
const ok = { data: {}, error: null };
const err = (code: string) => ({ data: {}, error: { code, name: 'AuthApiError' } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  auth.getSession.mockResolvedValue(anon);
});

describe('startSignUp', () => {
  it('adds the email to the current anonymous user, so its id and Plus stay', async () => {
    auth.updateUser.mockResolvedValue(ok);
    expect(await startSignUp(' New@Example.com ', 'longenough')).toEqual({ status: 'code_sent', kind: 'link' });
    expect(auth.updateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('without an anonymous session it signs up a new user', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.signUp.mockResolvedValue({ data: { user: { id: 'n', identities: [{}] } }, error: null });
    expect(await startSignUp('a@b.co', 'longenough')).toEqual({ status: 'code_sent', kind: 'signup' });
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'longenough' });
  });

  it('an email that already has an account is exists', async () => {
    auth.updateUser.mockResolvedValue(err('email_exists'));
    expect(await startSignUp('a@b.co', 'longenough')).toEqual({ status: 'exists' });
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.signUp.mockResolvedValue({ data: { user: { id: 'fake', identities: [] } }, error: null }); // Supabase hides existing emails this way
    expect(await startSignUp('a@b.co', 'longenough')).toEqual({ status: 'exists' });
  });

  it('checks the email and password before calling Supabase', async () => {
    expect(await startSignUp('not-an-email', 'longenough')).toEqual({ status: 'invalid' });
    expect(await startSignUp('a@b.co', 'short')).toEqual({ status: 'weak' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('too many emails is rate', async () => {
    auth.updateUser.mockResolvedValue(err('over_email_send_rate_limit'));
    expect(await startSignUp('a@b.co', 'longenough')).toEqual({ status: 'rate' });
  });
});

describe('confirmCode', () => {
  it('link: verifies the code, then sets the password on the same user', async () => {
    auth.verifyOtp.mockResolvedValue(ok);
    auth.updateUser.mockResolvedValue(ok);
    auth.refreshSession.mockResolvedValue(ok);
    expect(await confirmCode('link', 'a@b.co', ' 123456 ', 'longenough')).toBe('linked');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.co', token: '123456', type: 'email_change' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'longenough' });
    expect(plusAfterUserChange).not.toHaveBeenCalled();
  });

  it('signup: verifies and switches to the new user', async () => {
    auth.verifyOtp.mockResolvedValue(ok);
    expect(await confirmCode('signup', 'a@b.co', '123456', 'longenough')).toBe('switched');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.co', token: '123456', type: 'signup' });
    expect(plusAfterUserChange).toHaveBeenCalledWith(true);
  });

  it('recovery: verifies, sets the new password and switches to that user', async () => {
    auth.verifyOtp.mockResolvedValue(ok);
    auth.updateUser.mockResolvedValue(ok);
    expect(await confirmCode('recovery', 'a@b.co', '123456', 'newpassword')).toBe('switched');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.co', token: '123456', type: 'recovery' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
    expect(plusAfterUserChange).toHaveBeenCalledWith(true);
  });

  it('a wrong or expired code is wrong_code, and nothing else happens', async () => {
    auth.verifyOtp.mockResolvedValue(err('otp_expired'));
    expect(await confirmCode('link', 'a@b.co', '123456', 'longenough')).toBe('wrong_code');
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(await confirmCode('link', 'a@b.co', '12ab', 'longenough')).toBe('wrong_code');
  });
});

describe('resendCode and startPasswordReset', () => {
  it('resends the right kind of email', async () => {
    auth.resend.mockResolvedValue(ok);
    expect(await resendCode('link', 'a@b.co')).toBe('sent');
    expect(auth.resend).toHaveBeenCalledWith({ type: 'email_change', email: 'a@b.co' });
    expect(await resendCode('signup', 'a@b.co')).toBe('sent');
    expect(auth.resend).toHaveBeenLastCalledWith({ type: 'signup', email: 'a@b.co' });
  });

  it('recovery resends by asking for another reset', async () => {
    auth.resetPasswordForEmail.mockResolvedValue(ok);
    expect(await resendCode('recovery', 'a@b.co')).toBe('sent');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co');
  });

  it('starts a password reset with a code', async () => {
    auth.resetPasswordForEmail.mockResolvedValue(ok);
    expect(await startPasswordReset(' A@B.co ')).toEqual({ status: 'code_sent', kind: 'recovery' });
    expect(await startPasswordReset('nope')).toEqual({ status: 'invalid' });
  });

  it('offline', async () => {
    auth.resetPasswordForEmail.mockRejectedValue(new TypeError('Network request failed'));
    expect(await startPasswordReset('a@b.co')).toEqual({ status: 'offline' });
  });
});
