import { describe, expect, it } from 'vitest';
import type { IslandAction } from '../../modules/daily-native/island';
import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import { makeTestDb } from '../db/testDb';
import { getStates, saveReminder, turnOffBuiltins } from '../reminders/store';
import { saveReport } from '../report/store';
import { endIslandBreak, markIslandReportSeen, startIslandBreak, syncIsland } from './drive';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();
const fake = () => {
  const calls: string[] = [];
  let queue: IslandAction[] = [];
  let enabled = true;
  return {
    calls,
    push: (a: IslandAction) => { queue.push(a); },
    setEnabled: (on: boolean) => { enabled = on; },
    api: {
      isEnabled: () => enabled,
      show: async (s: string) => { calls.push('show:' + JSON.parse(s).phase); },
      end: async () => { calls.push('end'); },
      takeActions: () => { const q = queue; queue = []; return q; }
    }
  };
};
const setup = async () => { const db = await makeTestDb(); turnOffBuiltins(db); return db; };
const lunch = (db: Db) =>
  (saveReminder(db, { name: 'Lunch', message: 'Eat', animation: 'meal', schedule: { type: 'time', time: '13:00', days: [1, 2, 3, 4, 5, 6, 7] }, breakSec: 600 }) as { ok: true; id: number }).id;

describe('syncIsland', () => {
  it('shows progress on first sync, then nothing while unchanged', async () => {
    const db = await setup(); const f = fake();
    await syncIsland(db, f.api, at(10)); await syncIsland(db, f.api, at(10, 1));
    expect(f.calls).toEqual(['show:progress']);
  });
  it('re-shows after 6 hours', async () => {
    const db = await setup(); const f = fake();
    await syncIsland(db, f.api, at(9)); await syncIsland(db, f.api, at(15, 1));
    expect(f.calls).toEqual(['show:progress', 'show:progress']);
  });
  it('ends once when switched off', async () => {
    const db = await setup(); const f = fake();
    await syncIsland(db, f.api, at(10)); setSetting(db, 'island', '0');
    await syncIsland(db, f.api, at(10, 1)); await syncIsland(db, f.api, at(10, 2));
    expect(f.calls).toEqual(['show:progress', 'end']);
  });
  it('ends once when iOS has Live Activities off', async () => {
    const db = await setup(); const f = fake();
    await syncIsland(db, f.api, at(10)); f.setEnabled(false);
    await syncIsland(db, f.api, at(10, 1)); await syncIsland(db, f.api, at(10, 2));
    expect(f.calls).toEqual(['show:progress', 'end']);
  });
  it('an action applies once and the reminder stays handled', async () => {
    const db = await setup(); const f = fake(); const id = lunch(db);
    await syncIsland(db, f.api, at(13, 5));
    f.push({ action: 'done', reminderId: id, atMs: at(13, 6) });
    await syncIsland(db, f.api, at(13, 7)); await syncIsland(db, f.api, at(13, 8));
    expect(f.calls).toEqual(['show:reminder', 'show:progress']);
    expect(getStates(db).get(id)?.lastDoneAt).toBe(at(13, 6));
  });
  it('snooze hides the reminder without marking it done', async () => {
    const db = await setup(); const f = fake(); const id = lunch(db);
    await syncIsland(db, f.api, at(13, 5));
    f.push({ action: 'snooze', reminderId: id, atMs: at(13, 6) });
    await syncIsland(db, f.api, at(13, 7));
    expect(f.calls).toEqual(['show:reminder', 'show:progress']);
    expect(getStates(db).get(id)?.lastDoneAt ?? null).toBeNull();
    expect(JSON.parse(getSetting(db, 'island_handled'))[id]).toBe(at(13, 6));
  });
  it('endBreak from the Island clears the break', async () => {
    const db = await setup(); const f = fake();
    startIslandBreak(db, { reminderId: null, startMs: at(16), totalSec: 300 });
    await syncIsland(db, f.api, at(16, 1));
    f.push({ action: 'endBreak', reminderId: null, atMs: at(16, 2) });
    await syncIsland(db, f.api, at(16, 2));
    expect(f.calls).toEqual(['show:break', 'show:progress']);
    expect(getSetting(db, 'island_break')).toBe('');
  });
  it('a break that ran out is ignored', async () => {
    const db = await setup(); const f = fake();
    startIslandBreak(db, { reminderId: null, startMs: at(16), totalSec: 300 });
    await syncIsland(db, f.api, at(16, 10));
    expect(f.calls).toEqual(['show:progress']);
    endIslandBreak(db);
  });
  it('report shows until the Report tab is opened', async () => {
    const db = await setup(); const f = fake();
    saveReport(db, { day: '2026-10-06', kind: 'plain', headline: 'A calm day', story: null, highlights: [], plan: [], aiError: null, final: true, createdMs: at(21) });
    await syncIsland(db, f.api, at(21, 30));
    markIslandReportSeen(db, at(21, 31));
    await syncIsland(db, f.api, at(21, 32));
    expect(f.calls).toEqual(['show:report', 'show:progress']);
  });
});
