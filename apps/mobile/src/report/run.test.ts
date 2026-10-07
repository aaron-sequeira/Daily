import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/db';
import { setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { expoNotifier } from '../reminders/expoNotifier';
import type { FakeNotifier } from '../reminders/fakeNotifier';
import { aiReport, type AiResult, type ReportOut } from './ai';
import { onReportsWritten, runReportWriter, runRewrite } from './run';
import { loadReport } from './store';

// run.ts glues the writer to the app: its database, notifier and AI client are swapped for test ones here.
const h = vi.hoisted(() => ({ db: null as unknown as Db, dbFails: false }));
vi.mock('../db/expoDb', () => ({ getDb: () => { if (h.dbFails) throw new Error('database unavailable'); return h.db; } }));
vi.mock('../reminders/expoNotifier', async () => ({ expoNotifier: new (await import('../reminders/fakeNotifier')).FakeNotifier() }));
vi.mock('./ai', () => ({ aiConfig: () => null, aiReport: vi.fn(), aiWeek: vi.fn() }));

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();
const AI: ReportOut = { headline: 'AI headline', story: 'AI story.', tomorrow: ['Tip one', 'Tip two'] };
const notifier = expoNotifier as unknown as FakeNotifier;
const ai = vi.mocked(aiReport);
const later = () => { let land!: (r: AiResult<ReportOut>) => void; return { promise: new Promise<AiResult<ReportOut>>((r) => { land = r; }), land: (r: AiResult<ReportOut>) => land(r) }; };

describe('report runner', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(21));
    h.db = await makeTestDb();
    h.dbFails = false;
    setSetting(h.db, 'onboarded', '1');
    setSetting(h.db, 'dev_plus', '1');
    h.db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.x', ?, ?, '2026-10-06')", [at(12), at(12, 42)]);
    notifier.reports = [];
    ai.mockReset();
    ai.mockResolvedValue({ ok: true, json: AI });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('catches a writer that throws straight away', async () => {
    h.dbFails = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let run: Promise<unknown> | undefined;
    expect(() => { run = runReportWriter({ retryFailed: false }); }).not.toThrow();
    await expect(run).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('tells listeners after a run that wrote a day, and only then', async () => {
    const heard = vi.fn();
    const stop = onReportsWritten(heard);
    await runReportWriter({ retryFailed: false });
    expect(loadReport(h.db, '2026-10-06')).toMatchObject({ kind: 'ai' });
    expect(heard).toHaveBeenCalledTimes(1);
    await runReportWriter({ retryFailed: false }); // nothing due
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    h.db.run('DELETE FROM reports');
    await runReportWriter({ retryFailed: false });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('runs a rewrite after the writer in flight, and holds off the writer while it runs', async () => {
    const first = later();
    ai.mockReturnValueOnce(first.promise);
    const writer = runReportWriter({ retryFailed: false }); // the 9 pm write, waiting on the AI
    await vi.waitFor(() => expect(ai).toHaveBeenCalledTimes(1));
    const second = later();
    ai.mockReturnValueOnce(second.promise);
    const rewrite = runRewrite('2026-10-06');
    await Promise.resolve();
    expect(ai).toHaveBeenCalledTimes(1); // queued behind the write
    first.land({ ok: true, json: AI });
    await writer;
    await vi.waitFor(() => expect(ai).toHaveBeenCalledTimes(2));
    expect(notifier.reports).toHaveLength(1);

    vi.setSystemTime(at(21, 1));
    h.db.run('UPDATE reports SET created_ms = ?', [at(20)]); // pretend it is due again: only the rewrite may write now
    const minute = runReportWriter({ retryFailed: false });
    second.land({ ok: true, json: { ...AI, headline: 'Rewritten' } });
    expect(await rewrite).toBeNull();
    await minute;
    expect(ai).toHaveBeenCalledTimes(2);
    expect(loadReport(h.db, '2026-10-06')).toMatchObject({ headline: 'Rewritten', createdMs: at(21, 1) });
    expect(notifier.reports).toHaveLength(1);
  });
});
