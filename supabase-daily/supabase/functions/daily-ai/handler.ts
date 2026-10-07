import { MAX_BODY_BYTES, parseRequest, type AiRequest } from './contract.ts';
import { checkReport, checkWeek } from './ground.ts';
import { callModel, type FetchFn } from './openrouter.ts';
import { buildPrompt } from './prompt.ts';

export type AiError = 'not_plus' | 'limit' | 'invalid' | 'failed';
export type Deps = { apiKey: string; models: string[]; fetchFn: FetchFn; isPlus(authorization: string): Promise<boolean> };

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const failure = (status: number, error: AiError) => reply(status, { ok: false, error });
const check = (r: AiRequest, raw: unknown) => (r.kind === 'report' ? checkReport(raw, r.input) : checkWeek(raw, r.input));

/** spec §11: validate → Plus → model (one retry on a bad answer) → grounded JSON. Never logs the key or the input. */
export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return failure(405, 'failed');
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return failure(401, 'failed');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return failure(413, 'failed');
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return failure(413, 'failed');
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
    let answer: unknown;
    try {
      answer = await callModel({ apiKey: deps.apiKey, models: deps.models, fetchFn: deps.fetchFn, ...prompt });
    } catch (e) {
      console.warn('daily-ai: model call failed:', e instanceof Error ? e.message : 'unknown');
      return failure(502, 'failed');
    }
    const json = check(request, answer);
    if (json) return reply(200, { ok: true, json });
  }
  return failure(200, 'invalid');
}
