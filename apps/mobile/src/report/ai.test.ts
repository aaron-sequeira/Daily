import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiReport, aiWeek, type AiConfig } from './ai';
import type { ReportInput } from './input';

const input = { day: '2026-10-06' } as ReportInput;
const out = { headline: 'A calm day.', story: 'Quiet.', tomorrow: ['One', 'Two'] };
const cfg = (reply: () => Promise<Response>): AiConfig & { fetchFn: ReturnType<typeof vi.fn> } =>
  ({ url: 'http://10.0.2.2:8787', token: 'dev', timeoutMs: 1000, fetchFn: vi.fn(reply) }) as never;
const ok = (body: unknown) => async () => new Response(JSON.stringify(body));

describe('AI client', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('posts the kind and input with the token, and returns the story', async () => {
    const c = cfg(ok({ ok: true, json: out }));
    expect(await aiReport(c, input, 'auto')).toEqual({ ok: true, json: out });
    const [url, init] = c.fetchFn.mock.calls[0];
    expect(url).toBe('http://10.0.2.2:8787');
    expect(init.headers.authorization).toBe('Bearer dev');
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

  it('returns the week sentence', async () => {
    expect(await aiWeek(cfg(ok({ ok: true, json: { sentence: 'Calmer.' } })), {} as never)).toEqual({ ok: true, json: { sentence: 'Calmer.' } });
  });
});
