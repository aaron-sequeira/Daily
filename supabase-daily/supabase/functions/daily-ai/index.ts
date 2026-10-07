// Supabase Edge Function entry (Deno). All logic lives in handler.ts, which also runs and is tested under Node.
import { handle } from './handler.ts';
import { DEFAULT_MODELS } from './openrouter.ts';

declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void };

const models = (Deno.env.get('DAILY_AI_MODELS') ?? '').split(',').map((m) => m.trim()).filter(Boolean);

Deno.serve((req) => handle(req, {
  apiKey: Deno.env.get('OPENROUTER_API_KEY') ?? '',
  models: models.length ? models : DEFAULT_MODELS,
  fetchFn: fetch,
  // ponytail: M4 never deploys this; M5 replaces the stub with the JWT user's RevenueCat entitlement + rate limits.
  isPlus: async () => true
}));
