import type { Db } from '../db/db';
import { saveReport } from './store';

// Tue 6 Oct 2026, Asia/Kolkata (vitest.setup.ts).
export const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();

/** Tuesday: 92 minutes over five sessions, three pickups, two waters, one mood; two earlier days; Monday's report. */
export function seedReportDay(db: Db): void {
  const apps: [string, string, string][] = [['com.instagram.android', 'Instagram', 'social'], ['com.whatsapp', 'WhatsApp', 'messages'], ['com.duolingo', 'Duolingo', 'learning']];
  for (const a of apps) db.run('INSERT INTO apps (package, label, category) VALUES (?, ?, ?)', a);
  const s = (pkg: string, from: number, to: number, day = '2026-10-06') =>
    db.run('INSERT INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [pkg, from, to, day]);
  s('com.duolingo', at(7, 30), at(7, 50));
  s('com.whatsapp', at(8), at(8, 10));
  s('com.whatsapp', at(12), at(12, 5));
  s('com.instagram.android', at(12, 10), at(12, 52));
  s('com.whatsapp', at(23, 10), at(23, 25));
  s('com.whatsapp', at(9, 0, 5), at(10, 0, 5), '2026-10-05');
  s('com.instagram.android', at(10, 0, 1), at(10, 30, 1), '2026-10-01');
  for (const t of [at(7, 29), at(11, 59), at(23, 9)]) db.run('INSERT INTO pickups (ts_ms, day) VALUES (?, ?)', [t, '2026-10-06']);
  for (const t of [at(9), at(15)]) db.run('INSERT INTO water_log (ts_ms, day) VALUES (?, ?)', [t, '2026-10-06']);
  db.run('INSERT INTO mood_log (day, ts_ms, mood) VALUES (?, ?, ?)', ['2026-10-06', at(7, 30), 'glowing']);
  saveReport(db, {
    day: '2026-10-05', kind: 'plain', headline: 'Monday', story: null, highlights: [],
    plan: [{ text: 'Leave Instagram after 20 minutes', done: true }], aiError: null, final: true, createdMs: at(21, 0, 5)
  });
}
