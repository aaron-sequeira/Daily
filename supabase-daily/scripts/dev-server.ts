// Local stand-in for the daily-ai Edge Function, for the emulator: http://10.0.2.2:8787 reaches this PC's 127.0.0.1.
// Reads the owner's OpenRouter key from OPENROUTER_API_KEY or apps/consumer/.env. Never prints it.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { handle } from '../supabase/functions/daily-ai/handler.ts';
import { DEFAULT_MODELS } from '../supabase/functions/daily-ai/openrouter.ts';

const PORT = 8787;

function openRouterKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = readFileSync(resolve(import.meta.dirname, '../../apps/consumer/.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('OPEN_ROUTER_APIKEY='));
  if (!line) throw new Error('No OpenRouter key: set OPENROUTER_API_KEY, or OPEN_ROUTER_APIKEY in apps/consumer/.env');
  return line.slice('OPEN_ROUTER_APIKEY='.length).trim().replace(/^["']|["']$/g, '');
}

const apiKey = openRouterKey();

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const r = await handle(
    new Request(`http://127.0.0.1:${PORT}/daily-ai`, {
      method: req.method,
      headers: { authorization: req.headers.authorization ?? '', 'content-type': 'application/json' },
      body: req.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined
    }),
    { apiKey, models: DEFAULT_MODELS, fetchFn: fetch, isPlus: async () => true }
  );
  const text = await r.text();
  res.writeHead(r.status, { 'content-type': 'application/json' }).end(text);
  console.log(`${new Date().toLocaleTimeString()} ${req.method} → ${r.status} ${text.slice(0, 100)}`);
}).listen(PORT, '127.0.0.1', () => console.log(`daily-ai dev server on http://127.0.0.1:${PORT} (emulator: http://10.0.2.2:${PORT})`));
