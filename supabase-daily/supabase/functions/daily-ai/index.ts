// Supabase Edge Function entry (Deno). All logic lives in handler.ts, which also runs and is tested under Node.
import { makeIsPlus } from './entitlement.ts';
import { handle } from './handler.ts';
import { DEFAULT_MODELS } from './openrouter.ts';
import { makeQuota } from './quota.ts';
import { userIdFrom, type Rest } from './supabase-rest.ts';

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void };

const env = (k: string) => Deno.env.get(k) ?? '';
const models = env('DAILY_AI_MODELS').split(',').map((m) => m.trim()).filter(Boolean);
const rest: Rest = { url: env('SUPABASE_URL'), anonKey: env('SUPABASE_ANON_KEY'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), fetchFn: fetch };

Deno.serve((req) => handle(req, {
  apiKey: env('OPENROUTER_API_KEY'),
  models: models.length ? models : DEFAULT_MODELS,
  fetchFn: fetch,
  userId: (auth) => userIdFrom(rest, auth),
  isPlus: makeIsPlus(rest, env('REVENUECAT_SECRET')),
  quota: makeQuota(rest)
}));
