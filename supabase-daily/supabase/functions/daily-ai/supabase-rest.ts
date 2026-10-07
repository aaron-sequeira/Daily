import type { FetchFn } from './openrouter.ts';

export type Rest = { url: string; anonKey: string; serviceKey: string; fetchFn: FetchFn };

/** Headers for the service role: only the function holds this key. */
export const service = (r: Rest) => ({ apikey: r.serviceKey, authorization: `Bearer ${r.serviceKey}`, 'content-type': 'application/json' });

/** The signed-in (anonymous) user behind `authorization`, or null. The bare anon key has no user, so it gets null. */
export async function userIdFrom(r: Rest, authorization: string): Promise<string | null> {
  try {
    const res = await r.fetchFn(`${r.url}/auth/v1/user`, { headers: { authorization, apikey: r.anonKey } });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user.id === 'string' && user.id ? user.id : null;
  } catch {
    return null;
  }
}
