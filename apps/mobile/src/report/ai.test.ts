import { describe, expect, it, vi } from 'vitest';
import { aiReport, aiWeek, type AiConfig } from './ai';
import type { ReportInput } from './input';

const input = { day: '2026-10-06' } as ReportInput;
const out = { headline: 'A calm day.', story: 'Quiet.', tomorrow: ['One', 'Two'] };
const cfg = (reply: () => Promise<Response>): AiConfig & { fetchFn: ReturnType<typeof vi.fn> } =>
  ({ url: 'http://10.0.2.2:8787', token: 'dev', timeoutMs: 1000, fetchFn: vi.fn(reply) }) as never;
const ok = (body: unknown) => async () => new Response(JSON.stringify(body));

describe('AI client', () => {
  it('posts the kind and input with the token, and returns the story', async () => {
    const c = cfg(ok({ ok: true, json: out }));
    expect(await aiReport(c, input)).toEqual({ ok: true, json: out });
    const [url, init] = c.fetchFn.mock.calls[0];
    expect(url).toBe('http://10.0.2.2:8787');
    expect(init.headers.authorization).toBe('Bearer dev');
    expect(JSON.parse(init.body)).toEqual({ kind: 'report', input });
  });

  it('passes the server’s error codes through and calls everything else failed', async () => {
    expect(await aiReport(cfg(ok({ ok: false, error: 'limit' })), input)).toEqual({ ok: false, error: 'limit' });
    expect(await aiReport(cfg(ok({ ok: false, error: 'weird' })), input)).toEqual({ ok: false, error: 'failed' });
    expect(await aiReport(cfg(ok({ ok: true, json: { headline: 1 } })), input)).toEqual({ ok: false, error: 'failed' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await aiReport(cfg(async () => { throw new Error('offline'); }), input)).toEqual({ ok: false, error: 'failed' });
    warn.mockRestore();
    expect(await aiReport(null, input)).toEqual({ ok: false, error: 'failed' });
  });

  it('returns the week sentence', async () => {
    expect(await aiWeek(cfg(ok({ ok: true, json: { sentence: 'Calmer.' } })), {} as never)).toEqual({ ok: true, json: { sentence: 'Calmer.' } });
  });
});
