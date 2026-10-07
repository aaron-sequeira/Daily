import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, parseRequest } from '../../../../supabase-daily/supabase/functions/daily-ai/contract';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import { buildReportInput } from './input';
import { saveReport } from './store';
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

  it('names an app with a blank label by its package', async () => {
    const db = await makeTestDb();
    db.run("INSERT INTO apps (package, label, category) VALUES ('com.blank', '   ', 'fun')");
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.blank', ?, ?, '2026-10-06')", [at(9), at(9, 10)]);
    expect(buildReportInput(db, '2026-10-06', at(21)).apps).toEqual([{ name: 'com.blank', category: 'fun', minutes: 10, opens: 1 }]);
  });

  it('keeps the busiest possible day inside what the server accepts (32 KB)', async () => {
    const db = await makeTestDb();
    for (let i = 0; i < 14; i++) {
      const pkg = `com.app${i}`;
      db.run('INSERT INTO apps (package, label, category) VALUES (?, ?, ?)', [pkg, `${'A'.repeat(70)}${i}`, 'social']);
      for (let h = 0; h < 24; h++) db.run('INSERT INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [pkg, at(h, i * 4), at(h, i * 4 + 4), '2026-10-06']);
      // overlapping sessions (the app still open while the next starts) make midnight's hour "fuller" than 60 minutes
      db.run('INSERT INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [pkg, at(0, 1), at(0, 31), '2026-10-06']);
    }
    for (let i = 0; i < 150; i++) db.run('INSERT INTO water_log (ts_ms, day) VALUES (?, ?)', [at(8) + i * 1000, '2026-10-06']);
    for (let i = 0; i < 15; i++) db.run('INSERT INTO mood_log (day, ts_ms, mood) VALUES (?, ?, ?)', ['2026-10-06', at(9) + i * 60_000, 'happy']);
    saveReport(db, {
      day: '2026-10-05', kind: 'ai', headline: 'Monday', story: 'Quiet.', highlights: [],
      plan: Array.from({ length: 4 }, (_, i) => ({ text: `${'T'.repeat(119)}${i}`, done: i % 2 === 0 })), aiError: null, final: true, createdMs: 1
    });
    const input = buildReportInput(db, '2026-10-06', at(23, 59));
    expect(input.apps).toHaveLength(12);
    expect(input.apps.every((a) => a.name.length === 60)).toBe(true);
    expect(input.moods).toHaveLength(12);
    expect(input.water).toBe(100);
    expect(Math.max(...input.hourly)).toBe(60);
    const body = { kind: 'report', input };
    expect(parseRequest(body)).toEqual(body);
    expect(JSON.stringify(body).length).toBeLessThan(MAX_BODY_BYTES);
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
