import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { loadReport, loadWeekSentence, saveReport, saveWeekSentence, setPlanDone, type StoredReport } from './store';

const report: StoredReport = {
  day: '2026-10-06', kind: 'plain', headline: '1h 32m on your phone', story: null,
  highlights: [{ kind: 'late', label: 'After 11 pm', value: 'None' }],
  plan: [{ text: 'Leave Instagram after 20 minutes', done: false }, { text: 'Phone away by 11 pm', done: false }],
  aiError: null, final: false, createdMs: 1000
};

describe('report store', () => {
  it('saves, reloads and replaces a day', async () => {
    const db = await makeTestDb();
    saveReport(db, report);
    expect(loadReport(db, '2026-10-06')).toEqual(report);
    saveReport(db, { ...report, kind: 'ai', story: 'A calm day.', createdMs: 2000 });
    expect(loadReport(db, '2026-10-06')).toMatchObject({ kind: 'ai', story: 'A calm day.', createdMs: 2000 });
    expect(db.all('SELECT day FROM reports')).toHaveLength(1);
    expect(loadReport(db, '2026-10-07')).toBeNull();
  });

  it('ticks a plan item', async () => {
    const db = await makeTestDb();
    saveReport(db, report);
    setPlanDone(db, '2026-10-06', 1, true);
    expect(loadReport(db, '2026-10-06')!.plan).toEqual([{ text: 'Leave Instagram after 20 minutes', done: false }, { text: 'Phone away by 11 pm', done: true }]);
    setPlanDone(db, '2026-10-06', 5, true); // no such item: nothing happens
    setPlanDone(db, '2026-10-01', 0, true); // no such report: nothing happens
  });

  it('reads a damaged row as no report', async () => {
    const db = await makeTestDb();
    db.run("INSERT INTO reports (day, kind, json, created_ms) VALUES ('2026-10-06', 'plain', '{oops', 1)");
    expect(loadReport(db, '2026-10-06')).toBeNull();
  });

  it('keeps one sentence per week', async () => {
    const db = await makeTestDb();
    expect(loadWeekSentence(db, '2026-10-05')).toBeNull();
    saveWeekSentence(db, '2026-10-05', 'A calmer week.', 1);
    saveWeekSentence(db, '2026-10-05', 'An even calmer week.', 2);
    expect(loadWeekSentence(db, '2026-10-05')).toBe('An even calmer week.');
  });
});
