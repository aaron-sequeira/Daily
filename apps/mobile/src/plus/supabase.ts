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

let inflight: Promise<string | null> | null = null;

async function resolveUserId(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const { data, error: readError } = await sb.auth.getSession();
    if (readError) throw readError; // a failed refresh must not mint a new user and orphan the paid one
    if (data.session) return data.session.user.id;
    const { data: signed, error } = await sb.auth.signInAnonymously();
    if (error) throw error;
    return signed.user?.id ?? null;
  } catch (e) {
    console.warn('daily: sign-in failed', e);
    return null;
  }
}

const SIGN_IN_TIMEOUT_MS = 10_000;

/** The caller waits at most 10 s; on timeout it gets null and the attempt carries on in the background. */
function within(work: Promise<string | null>): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => { console.warn('daily: sign-in timed out'); resolve(null); }, SIGN_IN_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Spec §11: an anonymous Supabase user, created once and kept. Null offline, without config or after 10 s; callers try
 * again later. Concurrent callers share one attempt, even one that has outlived a caller's timeout, so a first launch
 * (or a slow one) can't create two users. */
export function ensureUserId(): Promise<string | null> {
  return within(inflight ??= resolveUserId().finally(() => { inflight = null; }));
}

export async function accessToken(): Promise<string | null> {
  if (!(await ensureUserId())) return null;
  const { data, error } = await supabase()!.auth.getSession();
  return error ? null : data.session?.access_token ?? null;
}
