import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import { FakeNotifier } from '../reminders/fakeNotifier';
import { coachTick } from './coach';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();

async function scrolling(since: number) {
  const db = await makeTestDb();
  setSetting(db, 'onboarded', '1');
  db.run("INSERT INTO apps (package, label, category, android_category) VALUES ('com.instagram.android', 'Instagram', 'social', 4)");
  db.run('INSERT INTO ingest_state (id, last_event_ms, open_pkg, open_start_ms) VALUES (1, ?, ?, ?)', [since, 'com.instagram.android', since]);
  return db;
}

describe('coachTick', () => {
  it('sends the long-stretch nudge once per stretch, even with a fresh process (Review Focus 2)', async () => {
    const db = await scrolling(at(20));
    const n = new FakeNotifier();
    expect(await coachTick(db, n, at(20, 31))).toBe('stretch');
    expect(n.coach).toEqual([{ key: 'coach-stretch', title: '31 minutes on Instagram', body: "That's a long stretch. A good spot to stop?" }]);
    expect(await coachTick(db, new FakeNotifier(), at(20, 55))).toBeNull(); // new notifier = new process; the key lives in SQLite
  });

  it('does nothing before onboarding or when notifications are off', async () => {
    const db = await scrolling(at(20));
    setSetting(db, 'onboarded', '0');
    expect(await coachTick(db, new FakeNotifier(), at(20, 31))).toBeNull();
    setSetting(db, 'onboarded', '1');
    const n = new FakeNotifier();
    n.allowed = false;
    expect(await coachTick(db, n, at(20, 31))).toBeNull();
    expect(db.all('SELECT * FROM nudges')).toEqual([]); // not recorded, so it can still fire later
  });

  it('respects Snooze 1 h and the 20-minute gap (Review Focus 4)', async () => {
    const db = await scrolling(at(20));
    setSetting(db, 'coach_snooze_until', at(21));
    expect(await coachTick(db, new FakeNotifier(), at(20, 31))).toBeNull();
    setSetting(db, 'coach_snooze_until', 0);
    db.run("INSERT INTO nudges (kind, key, ts_ms) VALUES ('goal80', 'goal80-2026-10-06', ?)", [at(20, 20)]);
    expect(await coachTick(db, new FakeNotifier(), at(20, 31))).toBeNull();
    expect(await coachTick(db, new FakeNotifier(), at(20, 40))).toBe('stretch');
  });

  it('treats an app with no category row as other (no stretch nudge)', async () => {
    const db = await scrolling(at(20));
    db.run('DELETE FROM apps');
    expect(await coachTick(db, new FakeNotifier(), at(20, 31))).toBeNull();
  });
});
