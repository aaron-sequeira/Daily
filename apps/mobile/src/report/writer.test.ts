import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/db';
import { setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { FakeNotifier } from '../reminders/fakeNotifier';
import { deleteEverything } from '../settings/data';
import type { AiResult, ReportOut, WeekOut } from './ai';
import { loadReport, loadWeekSentence, setPlanDone } from './store';
import { ensureWeekSentence, rewriteReport, writeDueReports, type WriterDeps } from './writer';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const AI: ReportOut = { headline: 'AI headline', story: 'AI story.', tomorrow: ['Tip one', 'Tip two'] };

function deps(over: Partial<WriterDeps> = {}) {
  const notifier = new FakeNotifier();
  const aiReport = vi.fn(async (_input?: unknown, _mode?: 'auto' | 'rewrite'): Promise<AiResult<ReportOut>> => ({ ok: true, json: AI }));
  const aiWeek = vi.fn(async (): Promise<AiResult<WeekOut>> => ({ ok: true, json: { sentence: 'AI week.' } }));
  return { isPlus: false, notifier, aiReport, aiWeek, ...over } as WriterDeps & { notifier: FakeNotifier; aiReport: typeof aiReport; aiWeek: typeof aiWeek };
}

async function db(): Promise<Db> {
  const d = await makeTestDb();
  setSetting(d, 'onboarded', '1');
  d.run("INSERT INTO apps (package, label, category) VALUES ('com.instagram.android', 'Instagram', 'social')");
  return d;
}
const use = (d: Db, day: number, h: number, m: number, min: number) =>
  d.run('INSERT INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', ['com.instagram.android', at(day, h, m), at(day, h, m) + min * 60_000, `2026-10-0${day}`]);

describe('writeDueReports', () => {
  it('asks for a rewrite only from Rewrite', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps({ isPlus: true });
    await writeDueReports(d, at(6, 21), dp, { retryFailed: false });
    expect(dp.aiReport.mock.calls.at(-1)![1]).toBe('auto');
    await rewriteReport(d, '2026-10-06', at(6, 21, 5), dp);
    expect(dp.aiReport.mock.calls.at(-1)![1]).toBe('rewrite');
  });

  it('waits for "Write it at", then writes today once and says so once', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps();
    expect(await writeDueReports(d, at(6, 20, 59), dp, { retryFailed: false })).toEqual([]);
    expect(await writeDueReports(d, at(6, 21), dp, { retryFailed: false })).toEqual(['2026-10-06']);
    expect(await writeDueReports(d, at(6, 21, 1), dp, { retryFailed: true })).toEqual([]);
    expect(loadReport(d, '2026-10-06')).toMatchObject({ kind: 'plain', story: null, aiError: null, final: false });
    expect(dp.notifier.reports).toEqual([{ day: '2026-10-06', body: loadReport(d, '2026-10-06')!.headline }]);
    expect(dp.aiReport).not.toHaveBeenCalled();
  });

  it('writes the AI story for Plus', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    await writeDueReports(d, at(6, 21), deps({ isPlus: true }), { retryFailed: false });
    expect(loadReport(d, '2026-10-06')).toMatchObject({ kind: 'ai', headline: 'AI headline', story: 'AI story.', plan: [{ text: 'Tip one', done: false }, { text: 'Tip two', done: false }] });
  });

  it('offline at write time: plain + failed, retried only on app open, never a second notification (Review Focus 2)', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps({ isPlus: true });
    dp.aiReport.mockResolvedValueOnce({ ok: false, error: 'failed' });
    await writeDueReports(d, at(6, 21), dp, { retryFailed: false });
    expect(loadReport(d, '2026-10-06')).toMatchObject({ kind: 'plain', aiError: 'failed' });
    expect(await writeDueReports(d, at(6, 21, 1), dp, { retryFailed: false })).toEqual([]); // the minute task doesn't retry
    expect(await writeDueReports(d, at(6, 21, 30), dp, { retryFailed: true })).toEqual(['2026-10-06']);
    expect(loadReport(d, '2026-10-06')).toMatchObject({ kind: 'ai', aiError: null });
    expect(dp.notifier.reports).toHaveLength(1);
  });

  it('writes a missed yesterday quietly, as final', async () => {
    const d = await db();
    use(d, 5, 12, 0, 30);
    const dp = deps();
    expect(await writeDueReports(d, at(6, 8), dp, { retryFailed: false })).toEqual(['2026-10-05']);
    expect(loadReport(d, '2026-10-05')).toMatchObject({ final: true });
    expect(dp.notifier.reports).toEqual([]);
  });

  it('brings last night’s report up to date after midnight (Review Focus 1)', async () => {
    const d = await db();
    use(d, 5, 12, 0, 42);
    const plain = deps();
    await writeDueReports(d, at(5, 21), plain, { retryFailed: false });
    expect(loadReport(d, '2026-10-05')!.highlights.at(-1)).toEqual({ kind: 'late', label: 'After 11 pm', value: 'None' });
    use(d, 5, 23, 10, 30); // scrolling after the report was written
    await writeDueReports(d, at(6, 8), plain, { retryFailed: false });
    expect(loadReport(d, '2026-10-05')).toMatchObject({ final: true, headline: '1h 12m on your phone, 2h 48m under your 4h goal.' });
    expect(loadReport(d, '2026-10-05')!.highlights.at(-1)).toEqual({ kind: 'late', label: 'After 11 pm', value: '30m' });

    const d2 = await db();
    use(d2, 5, 12, 0, 42);
    await writeDueReports(d2, at(5, 21), deps({ isPlus: true }), { retryFailed: false });
    use(d2, 5, 23, 10, 30);
    await writeDueReports(d2, at(6, 8), deps({ isPlus: true }), { retryFailed: false });
    expect(loadReport(d2, '2026-10-05')).toMatchObject({ kind: 'ai', headline: 'AI headline', final: true });
    expect(loadReport(d2, '2026-10-05')!.highlights.at(-1)!.value).toBe('30m');
  });

  it('still writes tonight’s report and notifies once after a mid-afternoon "Write it now"', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps({ isPlus: true });
    await rewriteReport(d, '2026-10-06', at(6, 15), dp);
    expect(loadReport(d, '2026-10-06')!.createdMs).toBe(at(6, 15));
    expect(await writeDueReports(d, at(6, 21), dp, { retryFailed: false })).toEqual(['2026-10-06']);
    expect(loadReport(d, '2026-10-06')!.createdMs).toBe(at(6, 21));
    expect(loadReport(d, '2026-10-06')!.createdMs).not.toBe(at(6, 15));
    expect(dp.notifier.reports).toHaveLength(1);
    expect(await writeDueReports(d, at(6, 21, 1), dp, { retryFailed: false })).toEqual([]);
    expect(dp.notifier.reports).toHaveLength(1);
  });

  it('keeps a 3 pm AI story when the AI fails at write time, with fresh numbers, notifying once', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps({ isPlus: true });
    await rewriteReport(d, '2026-10-06', at(6, 15), dp);
    use(d, 6, 19, 0, 60);
    expect(loadReport(d, '2026-10-06')!.highlights.find((h) => h.kind === 'longest')!.value).toBe('Instagram · 42m');
    dp.aiReport.mockResolvedValueOnce({ ok: false, error: 'failed' });
    expect(await writeDueReports(d, at(6, 21), dp, { retryFailed: false })).toEqual(['2026-10-06']);
    const r = loadReport(d, '2026-10-06')!;
    expect(r).toMatchObject({ kind: 'ai', headline: 'AI headline', story: 'AI story.', createdMs: at(6, 21), aiError: null });
    expect(r.highlights.find((h) => h.kind === 'longest')!.value).toBe('Instagram · 1h');
    expect(dp.notifier.reports).toEqual([{ day: '2026-10-06', body: 'AI headline' }]);
    expect(await writeDueReports(d, at(6, 21, 1), dp, { retryFailed: false })).toEqual([]);
    expect(dp.notifier.reports).toHaveLength(1);
  });

  it('carries a ticked tip over when the 9 pm story repeats it', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps({ isPlus: true });
    await rewriteReport(d, '2026-10-06', at(6, 15), dp);
    setPlanDone(d, '2026-10-06', 'Tip one', true);
    await writeDueReports(d, at(6, 21), dp, { retryFailed: false });
    expect(loadReport(d, '2026-10-06')!.plan).toEqual([{ text: 'Tip one', done: true }, { text: 'Tip two', done: false }]);
  });

  it('keeps a tick made while the 9 pm story was being written', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps({ isPlus: true });
    await rewriteReport(d, '2026-10-06', at(6, 15), dp);
    const tickThen = (r: AiResult<ReportOut>) => async () => { setPlanDone(d, '2026-10-06', 'Tip two', true); return r; };
    dp.aiReport.mockImplementationOnce(tickThen({ ok: false, error: 'failed' })); // the draft stays: with today's tick
    await writeDueReports(d, at(6, 21), dp, { retryFailed: false });
    expect(loadReport(d, '2026-10-06')!.plan).toEqual([{ text: 'Tip one', done: false }, { text: 'Tip two', done: true }]);

    const d2 = await db();
    use(d2, 6, 12, 0, 42);
    await rewriteReport(d2, '2026-10-06', at(6, 15), dp);
    dp.aiReport.mockImplementationOnce(async () => { setPlanDone(d2, '2026-10-06', 'Tip two', true); return { ok: true, json: AI }; });
    await writeDueReports(d2, at(6, 21), dp, { retryFailed: false }); // a new story: the tick carries over by text
    expect(loadReport(d2, '2026-10-06')!.plan).toEqual([{ text: 'Tip one', done: false }, { text: 'Tip two', done: true }]);
  });

  it('keeps a ticked plan when the silent retry on app open lands', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps({ isPlus: true });
    dp.aiReport.mockResolvedValueOnce({ ok: false, error: 'failed' });
    await writeDueReports(d, at(6, 21), dp, { retryFailed: false });
    const plain = loadReport(d, '2026-10-06')!;
    setPlanDone(d, '2026-10-06', plain.plan[0].text, true);
    expect(await writeDueReports(d, at(6, 21, 30), dp, { retryFailed: true })).toEqual(['2026-10-06']);
    expect(loadReport(d, '2026-10-06')).toMatchObject({
      kind: 'ai', headline: 'AI headline', story: 'AI story.', aiError: null,
      plan: [{ text: plain.plan[0].text, done: true }, { text: plain.plan[1].text, done: false }]
    });
  });

  it('saves nothing and says nothing when Delete everything runs during the AI call', async () => {
    const d = await db();
    const dp = deps({ isPlus: true });
    const wipeThen = (r: AiResult<ReportOut>) => async () => { deleteEverything(d, at(6, 21)); return r; };
    const again = () => { setSetting(d, 'onboarded', '1'); use(d, 6, 12, 0, 42); };

    again();
    dp.aiReport.mockImplementationOnce(wipeThen({ ok: true, json: AI }));
    expect(await writeDueReports(d, at(6, 21), dp, { retryFailed: false })).toEqual([]);
    expect(loadReport(d, '2026-10-06')).toBeNull();

    again(); // the 9 pm write over a 3 pm draft, AI failing
    await rewriteReport(d, '2026-10-06', at(6, 15), dp);
    dp.aiReport.mockImplementationOnce(wipeThen({ ok: false, error: 'failed' }));
    expect(await writeDueReports(d, at(6, 21), dp, { retryFailed: false })).toEqual([]);
    expect(loadReport(d, '2026-10-06')).toBeNull();

    again(); // "Write it now"
    dp.aiReport.mockImplementationOnce(wipeThen({ ok: false, error: 'failed' }));
    await rewriteReport(d, '2026-10-06', at(6, 15), dp);
    expect(loadReport(d, '2026-10-06')).toBeNull();

    again(); // the week sentence
    use(d, 1, 12, 0, 60);
    dp.aiWeek.mockImplementationOnce(async () => { deleteEverything(d, at(7, 9)); return { ok: true, json: { sentence: 'AI week.' } }; });
    expect(await ensureWeekSentence(d, '2026-09-28', at(7, 9), dp)).toBeNull();
    expect(loadWeekSentence(d, '2026-09-28')).toBeNull();

    expect(d.all('SELECT day FROM reports')).toEqual([]);
    expect(dp.notifier.reports).toEqual([]);
  });

  it('does not notify twice when a "Write it now" started before 9 pm lands after the 9 pm write', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    let clock = at(6, 20, 59);
    let land!: (r: AiResult<ReportOut>) => void;
    const dp = deps({ isPlus: true, now: () => clock });
    dp.aiReport.mockImplementationOnce(() => new Promise((r) => { land = r; }));
    const rewrite = rewriteReport(d, '2026-10-06', at(6, 20, 59), dp);
    clock = at(6, 21);
    expect(await writeDueReports(d, at(6, 21), dp, { retryFailed: false })).toEqual(['2026-10-06']);
    clock = at(6, 21) + 10_000;
    land({ ok: true, json: { ...AI, headline: 'Rewritten' } });
    expect(await rewrite).toBeNull();
    expect(loadReport(d, '2026-10-06')).toMatchObject({ headline: 'Rewritten', createdMs: at(6, 21) + 10_000 });
    clock = at(6, 21, 1);
    expect(await writeDueReports(d, at(6, 21, 1), dp, { retryFailed: false })).toEqual([]);
    expect(dp.notifier.reports).toHaveLength(1);
  });

  it('writes nothing before onboarding or on a day without phone time', async () => {
    const d = await db();
    const dp = deps();
    expect(await writeDueReports(d, at(6, 22), dp, { retryFailed: true })).toEqual([]);
    setSetting(d, 'onboarded', '0');
    use(d, 6, 12, 0, 42);
    expect(await writeDueReports(d, at(6, 22), dp, { retryFailed: true })).toEqual([]);
    expect(dp.notifier.reports).toEqual([]);
  });
});

describe('rewriteReport', () => {
  it('replaces the report on success and keeps it when the AI says no', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    await writeDueReports(d, at(6, 21), deps({ isPlus: true }), { retryFailed: false });
    const dp = deps({ isPlus: true });
    dp.aiReport.mockResolvedValueOnce({ ok: false, error: 'limit' });
    expect(await rewriteReport(d, '2026-10-06', at(6, 21, 5), dp)).toBe('limit');
    expect(loadReport(d, '2026-10-06')).toMatchObject({ kind: 'ai', headline: 'AI headline' });
    dp.aiReport.mockResolvedValueOnce({ ok: true, json: { ...AI, headline: 'Second take' } });
    expect(await rewriteReport(d, '2026-10-06', at(6, 21, 6), dp)).toBeNull();
    expect(loadReport(d, '2026-10-06')!.headline).toBe('Second take');
  });

  it('saves the plain report when there was nothing yet and the AI fails', async () => {
    const d = await db();
    use(d, 6, 12, 0, 42);
    const dp = deps({ isPlus: true });
    dp.aiReport.mockResolvedValueOnce({ ok: false, error: 'failed' });
    expect(await rewriteReport(d, '2026-10-06', at(6, 15), dp)).toBe('failed');
    expect(loadReport(d, '2026-10-06')).toMatchObject({ kind: 'plain', aiError: 'failed' });
  });
});

describe('ensureWeekSentence', () => {
  it('asks once per finished week, for Plus only', async () => {
    const d = await db();
    use(d, 1, 12, 0, 60); // Thu 1 Oct, in the week of Mon 28 Sep
    const free = deps();
    expect(await ensureWeekSentence(d, '2026-09-28', at(7, 9), free)).toBeNull();
    const plus = deps({ isPlus: true });
    expect(await ensureWeekSentence(d, '2026-10-05', at(7, 9), plus)).toBeNull(); // still running
    expect(plus.aiWeek).not.toHaveBeenCalled();
    expect(await ensureWeekSentence(d, '2026-09-28', at(7, 9), plus)).toBe('AI week.');
    expect(await ensureWeekSentence(d, '2026-09-28', at(7, 10), plus)).toBe('AI week.');
    expect(plus.aiWeek).toHaveBeenCalledTimes(1);
    expect(loadWeekSentence(d, '2026-09-28')).toBe('AI week.');
  });

  it('caches nothing when the AI fails', async () => {
    const d = await db();
    use(d, 1, 12, 0, 60);
    const plus = deps({ isPlus: true });
    plus.aiWeek.mockResolvedValueOnce({ ok: false, error: 'failed' });
    expect(await ensureWeekSentence(d, '2026-09-28', at(7, 9), plus)).toBeNull();
    expect(loadWeekSentence(d, '2026-09-28')).toBeNull();
  });

  it('makes one AI call when asked twice at once', async () => {
    const d = await db();
    use(d, 1, 12, 0, 60);
    const plus = deps({ isPlus: true });
    expect(await Promise.all([ensureWeekSentence(d, '2026-09-28', at(7, 9), plus), ensureWeekSentence(d, '2026-09-28', at(7, 9), plus)])).toEqual(['AI week.', 'AI week.']);
    expect(plus.aiWeek).toHaveBeenCalledTimes(1);
  });

  it('tries a failed week once a day, and an invalid one never again', async () => {
    const d = await db();
    use(d, 1, 12, 0, 60);
    const plus = deps({ isPlus: true });
    plus.aiWeek.mockResolvedValueOnce({ ok: false, error: 'failed' });
    expect(await ensureWeekSentence(d, '2026-09-28', at(7, 9), plus)).toBeNull();
    expect(await ensureWeekSentence(d, '2026-09-28', at(7, 22), plus)).toBeNull(); // same day: no second paid try
    expect(plus.aiWeek).toHaveBeenCalledTimes(1);
    expect(await ensureWeekSentence(d, '2026-09-28', at(8, 9), plus)).toBe('AI week.'); // the next day
    expect(plus.aiWeek).toHaveBeenCalledTimes(2);

    const d2 = await db();
    use(d2, 1, 12, 0, 60);
    const bad = deps({ isPlus: true });
    bad.aiWeek.mockResolvedValue({ ok: false, error: 'invalid' });
    expect(await ensureWeekSentence(d2, '2026-09-28', at(7, 9), bad)).toBeNull();
    expect(await ensureWeekSentence(d2, '2026-09-28', at(8, 9), bad)).toBeNull();
    expect(await ensureWeekSentence(d2, '2026-09-28', at(9, 9), bad)).toBeNull();
    expect(bad.aiWeek).toHaveBeenCalledTimes(1);
  });

  it('never builds a week that is still running', async () => {
    const d = await db();
    d.run('DROP TABLE sessions'); // building the week would throw
    const plus = deps({ isPlus: true });
    expect(await ensureWeekSentence(d, '2026-10-05', at(7, 9), plus)).toBeNull();
    expect(plus.aiWeek).not.toHaveBeenCalled();
  });
});
