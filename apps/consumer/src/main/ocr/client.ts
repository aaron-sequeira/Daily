import { createInterface } from 'node:readline';

export type OcrStatus = 'off' | 'starting' | 'ready' | 'no-language' | 'restarting' | 'failed';
/** `jpg` (base64) is present only when a screenshot was asked for; `text` is '' when text was not. */
export interface CaptureResult { text: string; ms: number; pid: number; title: string; w: number; h: number; jpg?: string; }
export interface CaptureOpts { text?: boolean; shot?: boolean }
export interface ChildLike {
  stdin: {
    write(s: string): unknown;
    end(): unknown;
    on(ev: 'error', cb: (err: Error) => void): unknown;
  };
  stdout: NodeJS.ReadableStream;
  on(ev: 'exit', cb: (code: number | null) => void): unknown;
  on(ev: 'error', cb: (err: Error) => void): unknown;
  kill(): unknown;
}
export interface OcrClient { start(): void; stop(): void; capture(opts?: CaptureOpts): Promise<CaptureResult | null>; status(): OcrStatus; }

export const RESTART_DELAYS_MS = [1000, 5000, 30000] as const;
const CRASH_WINDOW_MS = 10 * 60_000;
const MAX_CRASHES = 3; // more than this within the window → failed
const NO_LANGUAGE_EXIT_CODE = 2;

type Reply = { id?: string; ready?: boolean; ocr?: boolean; error?: string; text?: string; ms?: number; pid?: number; title?: string; w?: number; h?: number; jpg?: string };

export function createOcrClient(deps: { spawn: () => ChildLike; onStatus?: (s: OcrStatus) => void; timeoutMs?: number }): OcrClient {
  const timeoutMs = deps.timeoutMs ?? 8000;
  let status: OcrStatus = 'off';
  let ocr = true; // false when the helper is up without a Windows OCR language (screenshots only)
  let child: ChildLike | null = null;
  let seq = 0;
  let pending: { id: string; text: boolean; resolve: (r: CaptureResult | null) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let crashes: number[] = [];

  const setStatus = (s: OcrStatus): void => { if (s !== status) { status = s; deps.onStatus?.(s); } };
  const settle = (r: CaptureResult | null): void => {
    if (!pending) return;
    clearTimeout(pending.timer);
    const { resolve } = pending;
    pending = null;
    resolve(r);
  };

  function onLine(line: string): void {
    let msg: Reply;
    try { msg = JSON.parse(line) as Reply; } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    // ready without OCR (no Windows OCR language): screen text is unavailable, screenshots still work.
    if (msg.ready === true) { ocr = msg.ocr !== false; setStatus(ocr ? 'ready' : 'no-language'); return; }
    if (msg.ready === false) { setStatus('no-language'); return; }
    if (!pending || msg.id !== pending.id) return;
    if (msg.error || (pending.text ? typeof msg.text !== 'string' : typeof msg.jpg !== 'string')) { settle(null); return; }
    const r: CaptureResult = { text: msg.text ?? '', ms: msg.ms ?? 0, pid: msg.pid ?? -1, title: msg.title ?? '', w: msg.w ?? 0, h: msg.h ?? 0 };
    if (typeof msg.jpg === 'string') r.jpg = msg.jpg;
    settle(r);
  }

  function scheduleRestart(): void {
    const now = Date.now();
    crashes = [...crashes.filter((t) => now - t < CRASH_WINDOW_MS), now];
    if (crashes.length > MAX_CRASHES) { setStatus('failed'); return; }
    setStatus('restarting');
    restartTimer = setTimeout(spawnChild, RESTART_DELAYS_MS[Math.min(crashes.length, RESTART_DELAYS_MS.length) - 1]);
  }

  function spawnChild(): void {
    restartTimer = null;
    setStatus('starting');
    let c: ChildLike;
    try {
      c = deps.spawn();
    } catch {
      // spawn() threw synchronously (e.g. ENOENT raised eagerly) — treat like a crash.
      scheduleRestart();
      return;
    }
    child = c;
    let handled = false; // an 'error' and a subsequent 'exit' for the same child must count once
    const down = (code: number | null): void => {
      if (handled) return;
      handled = true;
      if (child !== c) return; // this child was already stopped/replaced
      child = null;
      settle(null);
      if (code === NO_LANGUAGE_EXIT_CODE) { setStatus('no-language'); return; }
      scheduleRestart();
    };
    createInterface({ input: c.stdout }).on('line', (l) => {
      if (child === c) onLine(l); // drop lines that arrive after this child was stopped/replaced
    });
    c.stdin.on('error', () => {}); // dead pipe (e.g. write after a timeout kill); the exit/timeout path recovers
    c.on('exit', (code) => down(code));
    c.on('error', () => down(null));
  }

  return {
    start() {
      if (status !== 'off') return;
      crashes = [];
      spawnChild();
    },
    stop() {
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      setStatus('off');
      settle(null);
      const c = child;
      child = null;
      if (c) { c.stdin.end(); c.kill(); }
    },
    capture({ text = true, shot = false } = {}) {
      if (!ocr) text = false;
      const up = status === 'ready' || (status === 'no-language' && !ocr);
      if (!up || !child || pending || (!text && !shot)) return Promise.resolve(null);
      const cmd = text && shot ? 'CAPTURE+SHOT' : shot ? 'SHOT' : 'CAPTURE';
      const id = String(++seq);
      const c = child;
      return new Promise((resolve) => {
        const timer = setTimeout(() => { settle(null); c.kill(); }, timeoutMs);
        pending = { id, text, resolve, timer };
        c.stdin.write(`${id} ${cmd}\n`);
      });
    },
    status: () => status
  };
}
