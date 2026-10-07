import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { reportTap } from './tap';

const tap = (data: Record<string, unknown>, date = 100) => ({ actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { date, request: { identifier: 'report-2026-10-06', content: { data } } } });

describe('reportTap', () => {
  it('opens the report once per tap, even though the last tap is replayed on every launch', async () => {
    const db = await makeTestDb();
    expect(reportTap(db, tap({ report: '2026-10-06' }))).toBe('2026-10-06');
    expect(reportTap(db, tap({ report: '2026-10-06' }))).toBeNull();
    expect(reportTap(db, tap({ report: '2026-10-06' }, 200))).toBe('2026-10-06');
    expect(reportTap(db, tap({ reminderId: 3 }))).toBeNull();
  });
});
