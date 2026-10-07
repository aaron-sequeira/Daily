import type { ReportInput } from './input';
import type { AiError } from './store';
import type { WeekInput } from './week';

export type ReportOut = { headline: string; story: string; tomorrow: string[] };
export type WeekOut = { sentence: string };
export type AiResult<T> = { ok: true; json: T } | { ok: false; error: AiError };
export type AiConfig = { url: string; token: string; fetchFn: typeof fetch; timeoutMs: number };

const ERRORS: readonly AiError[] = ['not_plus', 'limit', 'invalid', 'failed'];

/** From the build's environment (apps/mobile/.env, never committed). No URL: AI is unavailable, reports stay plain. */
export function aiConfig(): AiConfig | null {
  const url = process.env.EXPO_PUBLIC_DAILY_AI_URL ?? '';
  return url ? { url, token: process.env.EXPO_PUBLIC_DAILY_AI_TOKEN ?? '', fetchFn: fetch, timeoutMs: 35_000 } : null;
}

async function call<T>(cfg: AiConfig | null, body: unknown, valid: (json: unknown) => json is T): Promise<AiResult<T>> {
  if (!cfg) return { ok: false, error: 'failed' };
  const abort = new AbortController(); // ponytail: AbortSignal.timeout isn't in React Native
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The race ends the wait even if the request (or its body) ignores the abort.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { abort.abort(); reject(new Error('timed out')); }, cfg.timeoutMs);
  });
  try {
    const request = async () => {
      const res = await cfg.fetchFn(cfg.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: abort.signal
      });
      return (await res.json()) as { ok?: unknown; json?: unknown; error?: unknown };
    };
    const out = await Promise.race([request(), timeout]);
    if (out.ok === true) return valid(out.json) ? { ok: true, json: out.json } : { ok: false, error: 'failed' };
    return { ok: false, error: ERRORS.includes(out.error as AiError) ? (out.error as AiError) : 'failed' };
  } catch (e) {
    console.warn('daily: AI request failed', e);
    return { ok: false, error: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}

const isReport = (j: unknown): j is ReportOut => {
  const r = j as ReportOut | null;
  return !!r && typeof r.headline === 'string' && typeof r.story === 'string' && Array.isArray(r.tomorrow) && r.tomorrow.every((t) => typeof t === 'string');
};
const isWeek = (j: unknown): j is WeekOut => typeof (j as WeekOut | null)?.sentence === 'string';

export function aiReport(cfg: AiConfig | null, input: ReportInput, mode: 'auto' | 'rewrite'): Promise<AiResult<ReportOut>> {
  return call(cfg, { kind: 'report', mode, input }, isReport);
}

export function aiWeek(cfg: AiConfig | null, input: WeekInput): Promise<AiResult<WeekOut>> {
  return call(cfg, { kind: 'week', mode: 'auto', input }, isWeek);
}
