// Local stand-in for the daily-ai Edge Function, for the emulator: http://10.0.2.2:8787 reaches this PC's 127.0.0.1.
// Reads the owner's OpenRouter key from OPENROUTER_API_KEY or apps/consumer/.env. Never prints it.
import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { MAX_BODY_BYTES } from '../supabase/functions/daily-ai/contract.ts';
import { handle } from '../supabase/functions/daily-ai/handler.ts';
import { DEFAULT_MODELS } from '../supabase/functions/daily-ai/openrouter.ts';

const PORT = 8787;

function openRouterKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = readFileSync(resolve(import.meta.dirname, '../../apps/consumer/.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('OPEN_ROUTER_APIKEY='));
  if (!line) throw new Error('No OpenRouter key: set OPENROUTER_API_KEY, or OPEN_ROUTER_APIKEY in apps/consumer/.env');
  const key = line.slice('OPEN_ROUTER_APIKEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('No OpenRouter key: OPEN_ROUTER_APIKEY in apps/consumer/.env is empty');
  return key;
}

const apiKey = openRouterKey();

const json = (res: ServerResponse, status: number, text: string) => res.writeHead(status, { 'content-type': 'application/json' }).end(text);
const FAILED = JSON.stringify({ ok: false, error: 'failed' });

const server = createServer(async (req, res) => {
  const path = (req.url ?? '').split('?')[0];
  let status = 500;
  try {
    if (path !== '/' && path !== '/daily-ai') {
      status = 404;
      json(res, 404, FAILED);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > MAX_BODY_BYTES) {
        status = 413;
        res.setHeader('connection', 'close');
        json(res, 413, FAILED);
        req.destroy();
        return;
      }
      chunks.push(c as Buffer);
    }
    const r = await handle(
      new Request(`http://127.0.0.1:${PORT}/daily-ai`, {
        method: req.method,
        headers: { authorization: req.headers.authorization ?? '', 'content-type': 'application/json' },
        body: req.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined
      }),
      { apiKey, models: DEFAULT_MODELS, fetchFn: fetch, isPlus: async () => true }
    );
    status = r.status;
    json(res, r.status, await r.text());
  } catch (e) {
    status = 500;
    console.warn('dev-server error:', e instanceof Error ? e.message : 'unknown');
    if (!res.headersSent) json(res, 500, FAILED);
  } finally {
    console.log(`${new Date().toLocaleTimeString()} ${req.method} ${path} -> ${status}`);
  }
});
server.requestTimeout = 10_000;
server.listen(PORT, '127.0.0.1', () => console.log(`daily-ai dev server on http://127.0.0.1:${PORT} (emulator: http://10.0.2.2:${PORT})`));
