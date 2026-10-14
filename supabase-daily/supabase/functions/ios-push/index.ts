// Supabase Edge Function entry (Deno): server-driven Dynamic Island for Daily on iPhone. Logic lives in handler.ts.
import { makeApns } from './apns.ts';
import { handle } from './handler.ts';
import { makeStore } from './store.ts';

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void };

const env = (k: string) => Deno.env.get(k) ?? '';
const url = env('SUPABASE_URL');
const anonKey = env('SUPABASE_ANON_KEY');
const store = makeStore({ url, serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), fetchFn: fetch });
// APNS_KEY is the .p8 file's text; without it /sync and /token still work and /tick answers 503.
const apns = env('APNS_KEY') ? makeApns({ p8: env('APNS_KEY'), keyId: env('APNS_KEY_ID'), teamId: env('APNS_TEAM_ID') || 'B6H2KH4NKJ' }, fetch) : null;

async function userId(authorization: string): Promise<string | null> {
  if (!authorization) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { authorization, apikey: anonKey }, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: unknown };
    return typeof u.id === 'string' && u.id ? u.id : null;
  } catch {
    return null;
  }
}

Deno.serve((req) => handle(req, {
  store, apns, cronSecret: env('IOS_PUSH_CRON_SECRET'), userId,
  newSecret: () => crypto.randomUUID() + crypto.randomUUID().replace(/-/g, ''),
  now: () => Date.now()
}));
