import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import { buildReportInput } from './input';
import { at, seedReportDay } from './testSeed';

describe('buildReportInput', () => {
  it('turns a day into names and numbers (spec §10.1)', async () => {
    const db = await makeTestDb();
    seedReportDay(db);
    expect(buildReportInput(db, '2026-10-06', at(10, 0, 7))).toEqual({
      day: '2026-10-06', goalMin: 240, phoneMin: 92, pickups: 3,
      apps: [
        { name: 'Instagram', category: 'social', minutes: 42, opens: 1 },
        { name: 'WhatsApp', category: 'messages', minutes: 30, opens: 3 },
        { name: 'Duolingo', category: 'learning', minutes: 20, opens: 1 }
      ],
      categories: { social: 42, messages: 30, learning: 20 },
      hourly: [0, 0, 0, 0, 0, 0, 0, 20, 10, 0, 0, 0, 47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15],
      longest: { app: 'Instagram', category: 'social', minutes: 42, start: '12:10' },
      quietest: { from: '12:52', to: '23:10', minutes: 618 },
      late: { after: '23:00', minutes: 15 },
      moods: [{ mood: 'glowing', at: '07:30' }],
      water: 2,
      last7: [{ day: '2026-10-01', phoneMin: 30 }, { day: '2026-10-05', phoneMin: 60 }],
      yesterdayPlan: [{ text: 'Leave Instagram after 20 minutes', done: true }]
    });
  });

  it('counts the app that is still open when the report is written', async () => {
    const db = await makeTestDb();
    db.run("INSERT INTO apps (package, label, category) VALUES ('com.instagram.android', 'Instagram', 'social')");
    db.run('INSERT INTO ingest_state (id, last_event_ms, open_pkg, open_start_ms) VALUES (1, ?, ?, ?)', [at(20, 30), 'com.instagram.android', at(20, 30)]);
    const input = buildReportInput(db, '2026-10-06', at(21));
    expect(input.phoneMin).toBe(30);
    expect(input.apps).toEqual([{ name: 'Instagram', category: 'social', minutes: 30, opens: 1 }]);
    expect(input.hourly[20]).toBe(30);
  });

  it('describes an empty day without inventing anything', async () => {
    const db = await makeTestDb();
    const input = buildReportInput(db, '2026-10-06', at(21));
    expect(input).toMatchObject({ phoneMin: 0, pickups: 0, apps: [], categories: {}, longest: null, quietest: null, late: { after: '23:00', minutes: 0 }, moods: [], water: 0, last7: [], yesterdayPlan: [] });
    expect(input.hourly).toEqual(Array(24).fill(0));
  });

  it("names unknown apps by package, shortens long names, and honours the user's category", async () => {
    const db = await makeTestDb();
    db.run("INSERT INTO apps (package, label, category, user_category) VALUES ('com.long', ?, 'fun', 'work')", ['L'.repeat(80)]);
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.long', ?, ?, '2026-10-06'), ('com.unknown', ?, ?, '2026-10-06')", [at(9), at(9, 10), at(10), at(10, 5)]);
    const input = buildReportInput(db, '2026-10-06', at(21));
    expect(input.apps).toEqual([
      { name: 'L'.repeat(60), category: 'work', minutes: 10, opens: 1 },
      { name: 'com.unknown', category: 'other', minutes: 5, opens: 1 }
    ]);
  });

  it('counts late-night minutes when wind-down starts after midnight', async () => {
    const db = await makeTestDb();
    setSetting(db, 'wind_down', '00:30');
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.x', ?, ?, '2026-10-06')", [at(0, 40), at(1)]);
    expect(buildReportInput(db, '2026-10-06', at(21)).late).toEqual({ after: '00:30', minutes: 20 });
  });

  it('rejects malformed wind_down and goal_min settings', async () => {
    const db = await makeTestDb();
    setSetting(db, 'wind_down', 'bad');
    setSetting(db, 'goal_min', 'x');
    const input = buildReportInput(db, '2026-10-06', at(21));
    expect(input.late).toEqual({ after: '23:00', minutes: 0 });
    expect(input.goalMin).toBe(240);
  });
});
