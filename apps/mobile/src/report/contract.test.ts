import { describe, expect, it } from 'vitest';
import { parseRequest } from '../../../../supabase-daily/supabase/functions/daily-ai/contract';
import { makeTestDb } from '../db/testDb';
import { buildReportInput } from './input';
import { at, seedReportDay } from './testSeed';
import { buildWeek, weekInput } from './week';

describe('app ↔ daily-ai contract', () => {
  it('every report and week the app builds passes the server check unchanged', async () => {
    const db = await makeTestDb();
    seedReportDay(db);
    const input = buildReportInput(db, '2026-10-06', at(10, 0, 7));
    expect(parseRequest({ kind: 'report', input })).toEqual({ kind: 'report', input });
    const week = weekInput(buildWeek(db, '2026-10-05', at(10, 0, 7)))!;
    expect(parseRequest({ kind: 'week', input: week })).toEqual({ kind: 'week', input: week });
  });
});
