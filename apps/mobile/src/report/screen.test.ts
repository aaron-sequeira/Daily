import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { firstDataDay, reportScreen } from './screen';
import { saveReport } from './store';
import { at, seedReportDay } from './testSeed';

describe('reportScreen', () => {
  it('shows the saved report when there is one', async () => {
    const db = await makeTestDb();
    seedReportDay(db);
    expect(reportScreen(db, '2026-10-05', at(10, 0, 7))).toMatchObject({ saved: true, headline: 'Monday', plan: [{ text: 'Leave Instagram after 20 minutes', done: true }], empty: false });
  });

  it('previews the plain report for a day not written yet, from what is stored', async () => {
    const db = await makeTestDb();
    seedReportDay(db);
    expect(reportScreen(db, '2026-10-06', at(18))).toMatchObject({ saved: false, kind: 'plain', story: null, headline: '1h 32m on your phone, 2h 28m under your 4h goal.', empty: false });
  });

  it('says when a day is empty', async () => {
    const db = await makeTestDb();
    expect(reportScreen(db, '2026-10-06', at(18))).toMatchObject({ saved: false, empty: true });
  });

  it('finds the first day with data or a report', async () => {
    const db = await makeTestDb();
    expect(firstDataDay(db)).toBeNull();
    seedReportDay(db);
    expect(firstDataDay(db)).toBe('2026-10-01');
    saveReport(db, { day: '2026-09-20', kind: 'plain', headline: 'x', story: null, highlights: [], plan: [], aiError: null, final: true, createdMs: 1 });
    expect(firstDataDay(db)).toBe('2026-09-20');
  });
});
