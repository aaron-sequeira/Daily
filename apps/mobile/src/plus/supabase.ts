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
