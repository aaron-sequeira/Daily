import { MAX_BODY_BYTES, parseRequest, type AiRequest } from './contract.ts';
import { checkReport, checkWeek } from './ground.ts';
import { callModel, TIMEOUT_MS, type FetchFn } from './openrouter.ts';
import { buildPrompt } from './prompt.ts';

export type AiError = 'not_plus' | 'limit' | 'invalid' | 'failed';
export type Deps = { apiKey: string; models: string[]; fetchFn: FetchFn; isPlus(authorization: string): Promise<boolean>; now?: () => number };

/** The whole request, both attempts included, ends inside the app's 35 s wait. */
export const DEADLINE_MS = 30_000;
const RETRY_MIN_MS = 6_000; // less than this left: a retry would only time out

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const failure = (status: number, error: AiError) => reply(status, { ok: false, error });
const check = (r: AiRequest, raw: unknown) => (r.kind === 'report' ? checkReport(raw, r.input) : checkWeek(raw, r.input));

/** Reads the body as text, giving up as soon as it passes `max` bytes, whatever content-length claims. */
export async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** spec §11: validate → Plus → model (one retry on a bad answer) → grounded JSON. Never logs the key or the input. */
export async function handle(req: Request, deps: Deps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const start = now();
  if (req.method !== 'POST') return failure(405, 'failed');
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return failure(401, 'failed');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return failure(413, 'failed');
  const text = await readCapped(req, MAX_BODY_BYTES);
  if (text === null) return failure(413, 'failed');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return failure(400, 'failed');
  }
  const request = parseRequest(raw);
  if (!request) return failure(400, 'failed');
  if (!(await deps.isPlus(auth))) return failure(403, 'not_plus');
  if (!deps.apiKey) return failure(500, 'failed');

  const prompt = buildPrompt(request);
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = DEADLINE_MS - (now() - start);
    if (attempt > 0 && left < RETRY_MIN_MS) return failure(200, 'failed'); // ran out of time, not a bad answer: worth retrying later
    let answer: unknown;
    try {
      answer = await callModel({ apiKey: deps.apiKey, models: deps.models, fetchFn: deps.fetchFn, timeoutMs: Math.max(0, Math.min(TIMEOUT_MS, left)), ...prompt });
    } catch (e) {
      console.warn('daily-ai: model call failed:', e instanceof Error ? e.message : 'unknown');
      return failure(502, 'failed');
    }
    const json = check(request, answer);
    if (json) return reply(200, { ok: true, json });
  }
  return failure(200, 'invalid');
}
