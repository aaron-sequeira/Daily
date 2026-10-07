import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../plus/supabase', () => ({ accessToken: async () => null }));
import { aiConfig, aiReport, aiWeek, type AiConfig } from './ai';
import type { ReportInput } from './input';

const input = { day: '2026-10-06' } as ReportInput;
const out = { headline: 'A calm day.', story: 'Quiet.', tomorrow: ['One', 'Two'] };
const cfg = (reply: () => Promise<Response>, token: string | null = 'jwt', apiKey: string | null = null): AiConfig & { fetchFn: ReturnType<typeof vi.fn> } =>
  ({ url: 'http://10.0.2.2:8787', token: async () => token, apiKey, timeoutMs: 1000, fetchFn: vi.fn(reply) }) as never;
const ok = (body: unknown) => async () => new Response(JSON.stringify(body));

describe('AI client', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('posts the kind and input with the token, and returns the story', async () => {
    const c = cfg(ok({ ok: true, json: out }));
    expect(await aiReport(c, input, 'auto')).toEqual({ ok: true, json: out });
    const [url, init] = c.fetchFn.mock.calls[0];
    expect(url).toBe('http://10.0.2.2:8787');
    expect(init.headers.authorization).toBe('Bearer jwt');
    expect(JSON.parse(init.body)).toEqual({ kind: 'report', mode: 'auto', input });
  });

  it('sends rewrite as the mode for a rewrite', async () => {
    const c = cfg(ok({ ok: true, json: out }));
    await aiReport(c, input, 'rewrite');
    expect(JSON.parse(c.fetchFn.mock.calls[0][1].body).mode).toBe('rewrite');
  });

  it('passes the server’s error codes through and calls everything else failed', async () => {
    expect(await aiReport(cfg(ok({ ok: false, error: 'limit' })), input, 'auto')).toEqual({ ok: false, error: 'limit' });
    expect(await aiReport(cfg(ok({ ok: false, error: 'weird' })), input, 'auto')).toEqual({ ok: false, error: 'failed' });
    expect(await aiReport(cfg(ok({ ok: true, json: { headline: 1 } })), input, 'auto')).toEqual({ ok: false, error: 'failed' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await aiReport(cfg(async () => { throw new Error('offline'); }), input, 'auto')).toEqual({ ok: false, error: 'failed' });
    warn.mockRestore();
    expect(await aiReport(null, input, 'auto')).toEqual({ ok: false, error: 'failed' });
  });

  it('gives up with failed when the server never answers, and clears its timer', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = cfg(() => new Promise<Response>(() => {})); // ignores the abort signal too
    const result = aiReport(c, input, 'auto');
    await vi.advanceTimersByTimeAsync(999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ ok: false, error: 'failed' });
    expect((c.fetchFn.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    expect(await aiReport(cfg(ok({ ok: true, json: out })), input, 'auto')).toEqual({ ok: true, json: out });
    expect(vi.getTimerCount()).toBe(0); // an answer clears it too
  });

  it('sends the Supabase apikey when there is one, and fails without a session', async () => {
    const c = cfg(ok({ ok: true, json: out }), 'jwt', 'anon-key');
    await aiReport(c, input, 'auto');
    expect(c.fetchFn.mock.calls[0][1].headers).toMatchObject({ authorization: 'Bearer jwt', apikey: 'anon-key' });
    const none = cfg(ok({ ok: true, json: out }), null);
    expect(await aiReport(none, input, 'auto')).toEqual({ ok: false, error: 'failed' });
    expect(none.fetchFn).not.toHaveBeenCalled();
  });

  it('returns the week sentence', async () => {
    expect(await aiWeek(cfg(ok({ ok: true, json: { sentence: 'Calmer.' } })), {} as never)).toEqual({ ok: true, json: { sentence: 'Calmer.' } });
  });

  describe('aiConfig', () => {
    const keys = ['EXPO_PUBLIC_DAILY_AI_URL', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
    afterEach(() => { for (const k of keys) delete process.env[k]; vi.unstubAllGlobals(); });

    it('uses the Supabase function with the anon key, and is null with no env', () => {
      vi.stubGlobal('__DEV__', false);
      expect(aiConfig()).toBeNull();
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
      expect(aiConfig()).toMatchObject({ url: 'https://x.supabase.co/functions/v1/daily-ai', apiKey: 'anon' });
    });

    it('the dev server wins only in a dev build', async () => {
      process.env.EXPO_PUBLIC_DAILY_AI_URL = 'http://10.0.2.2:8787';
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
      vi.stubGlobal('__DEV__', true);
      expect(aiConfig()).toMatchObject({ url: 'http://10.0.2.2:8787', apiKey: null });
      vi.stubGlobal('__DEV__', false);
      expect(aiConfig()).toMatchObject({ url: 'https://x.supabase.co/functions/v1/daily-ai' });
    });
  });
});
