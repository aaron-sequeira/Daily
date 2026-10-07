import type { Msg } from './prompt.ts';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_MODELS = ['openai/gpt-6-luna', 'google/gemini-3.1-flash-lite'];
export const TIMEOUT_MS = 25_000;

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export type ModelCall = { apiKey: string; models: string[]; messages: Msg[]; schemaName: string; schema: Record<string, unknown>; fetchFn: FetchFn };

/** One chat completion, with OpenRouter falling back through `models` itself (spec §11). Throws on network, timeout
 * and HTTP errors; returns null when the answer isn't JSON, so the caller can retry it like any other bad answer. */
export async function callModel(c: ModelCall): Promise<unknown> {
  const res = await c.fetchFn(OPENROUTER_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${c.apiKey}`, 'content-type': 'application/json', 'x-title': 'Daily' },
    body: JSON.stringify({
      models: c.models,
      messages: c.messages,
      response_format: { type: 'json_schema', json_schema: { name: c.schemaName, strict: true, schema: c.schema } },
      provider: { data_collection: 'deny' },
      max_tokens: 900,
      reasoning: { effort: 'low' }
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
