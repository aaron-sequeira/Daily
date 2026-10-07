import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import type { Db } from '../db/db';
import { buildWeek, weekInput, weekSentence } from './week';

const at = (d: number, h: number, m = 0, mon = 9) => new Date(2026, mon, d, h, m).getTime();
const now = at(7, 20); // Wed 7 Oct 2026, 8 pm

async function seeded(): Promise<Db> {
  const db = await makeTestDb();
  db.run("INSERT INTO apps (package, label, category) VALUES ('com.instagram.android', 'Instagram', 'social'), ('com.whatsapp', 'WhatsApp', 'messages')");
  const s = (pkg: string, from: number, to: number, day: string) => db.run('INSERT INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [pkg, from, to, day]);
  s('com.instagram.android', at(5, 9), at(5, 10), '2026-10-05'); // Mon 60m
  s('com.whatsapp', at(6, 9), at(6, 9, 30), '2026-10-06');       // Tue 30m
  s('com.instagram.android', at(7, 9), at(7, 9, 30), '2026-10-07'); // Wed 30m
  s('com.whatsapp', at(28, 9, 0, 8), at(28, 11, 0, 8), '2026-09-28'); // last Mon 120m
  s('com.instagram.android', at(1, 9), at(1, 10), '2026-10-01');  // last Thu 60m
  return db;
}

describe('buildWeek', () => {
  it('builds Monday-to-Sunday bars, averages and top apps', async () => {
    const v = buildWeek(await seeded(), '2026-10-05', now);
    expect(v.days.map((d) => [d.label, d.phoneMin, d.isToday, d.future])).toEqual([
      ['Mon', 60, false, false], ['Tue', 30, false, false], ['Wed', 30, true, false],
      ['Thu', 0, false, true], ['Fri', 0, false, true], ['Sat', 0, false, true], ['Sun', 0, false, true]
    ]);
    expect(v.days[0].byCat).toEqual({ social: 60 });
    expect(v).toMatchObject({ weekStart: '2026-10-05', avgMin: 40, lastAvgMin: 90, deltaMin: -50, sentence: 'Down 50m a day vs last week.', complete: false });
    expect(v.topApps).toEqual([{ name: 'Instagram', category: 'social', minutes: 30 }, { name: 'WhatsApp', category: 'messages', minutes: 10 }]);
  });

  it('knows when a week is over and when there is nothing to compare with', async () => {
    const v = buildWeek(await seeded(), '2026-09-28', now);
    expect(v).toMatchObject({ avgMin: 90, lastAvgMin: null, deltaMin: null, sentence: 'Your daily average is 1h 30m.', complete: true });
  });

  it('gives the AI only the days so far', async () => {
    expect(weekInput(buildWeek(await seeded(), '2026-10-05', now))).toEqual({
      weekStart: '2026-10-05', avgMin: 40, lastAvgMin: 90,
      days: [{ day: '2026-10-05', phoneMin: 60 }, { day: '2026-10-06', phoneMin: 30 }, { day: '2026-10-07', phoneMin: 30 }],
      topApps: [{ name: 'Instagram', minutes: 30 }, { name: 'WhatsApp', minutes: 10 }]
    });
    expect(weekInput(buildWeek(await makeTestDb(), '2026-10-05', now))).toBeNull();
  });

  it('words the computed sentence', () => {
    expect(weekSentence(null, null)).toBe('No phone time recorded this week yet.');
    expect(weekSentence(100, 103)).toBe('About the same as last week: 1h 40m a day.');
    expect(weekSentence(130, 100)).toBe('Up 30m a day vs last week.');
  });
});
