import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import { loadToday } from './load';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();

describe('loadToday', () => {
  it('reads today\'s rows, the open app and the goal from the database', async () => {
    const db = await makeTestDb();
    setSetting(db, 'goal_min', 60);
    db.run("INSERT INTO apps (package, label, category) VALUES ('com.whatsapp', 'WhatsApp', 'messages')");
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.whatsapp', ?, ?, '2026-10-06')", [at(9), at(9, 30)]);
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.whatsapp', ?, ?, '2026-10-05')", [at(9) - 86_400_000, at(10) - 86_400_000]);
    db.run('INSERT INTO pickups (ts_ms, day) VALUES (?, ?)', [at(8), '2026-10-06']);
    db.run('INSERT INTO ingest_state (id, last_event_ms, open_pkg, open_start_ms) VALUES (1, ?, ?, ?)', [at(10), 'com.whatsapp', at(10)]);
    db.run("INSERT INTO apps (package, label, category, icon_png) VALUES ('com.idle', 'Idle', 'fun', 'ICON')");
    const v = loadToday(db, at(10, 15));
    expect(v.phoneMin).toBe(45);
    expect(v.pickups).toBe(1);
    expect(v.goalMin).toBe(60);
    expect(v.mood).toBe('happy'); // 45 of 60 = 0.75
    expect(JSON.stringify(v)).not.toContain('ICON'); // apps with no time today are not read
  });
});
