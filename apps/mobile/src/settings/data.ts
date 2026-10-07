import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { isCategory, type Category } from '../tracking/categories';

export const RETENTION_CHOICES = [30, 90, 180, 365] as const;

export function exportJson(db: Db): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    sessions: db.all('SELECT package, start_ms, end_ms, day FROM sessions ORDER BY start_ms'),
    pickups: db.all('SELECT ts_ms, day FROM pickups ORDER BY ts_ms'),
    apps: db.all('SELECT package, label, category, user_category FROM apps ORDER BY package'),
    mood_log: db.all('SELECT day, ts_ms, mood FROM mood_log ORDER BY ts_ms'),
    nudges: db.all('SELECT kind, key, ts_ms FROM nudges ORDER BY ts_ms'),
    reminders: db.all('SELECT id, builtin, name, message, animation, schedule, break_sec, enabled FROM reminders ORDER BY id'),
    reminder_state: db.all('SELECT id, last_fired_at, last_done_at, skip_date FROM reminder_state ORDER BY id'),
    water_log: db.all('SELECT ts_ms, day FROM water_log ORDER BY ts_ms'),
    settings: db.all('SELECT key, value FROM settings ORDER BY key')
  }, null, 2);
}

export function deleteEverything(db: Db, nowMs: number): void {
  db.tx(() => {
    for (const t of ['sessions', 'pickups', 'apps', 'ingest_state', 'mood_log', 'nudges', 'settings', 'reminders', 'reminder_state', 'water_log']) db.run(`DELETE FROM ${t}`);
    // Park the cursor at now so the next sync does not backfill the 7 days we just deleted.
    db.run('INSERT INTO ingest_state (id, last_event_ms, open_pkg, open_start_ms) VALUES (1, ?, NULL, NULL)', [nowMs]);
  });
}

export function setUserCategory(db: Db, pkg: string, cat: Category | null): void {
  db.run('UPDATE apps SET user_category = ? WHERE package = ?', [cat, pkg]);
}

export function appsForSettings(db: Db) {
  return db.all<{ package: string; label: string; category: string; user_category: string | null }>(
    'SELECT package, label, category, user_category FROM apps ORDER BY label COLLATE NOCASE'
  ).map((a) => ({
    package: a.package,
    label: a.label,
    category: (isCategory(a.user_category) ? a.user_category : isCategory(a.category) ? a.category : 'other') as Category,
    overridden: isCategory(a.user_category)
  }));
}

const SAMPLE: [pkg: string, label: string, cat: Category, startH: number, minutes: number][] = [
  ['com.duolingo', 'Duolingo', 'learning', 7.3, 21],
  ['com.whatsapp', 'WhatsApp', 'messages', 8.2, 24],
  ['com.google.android.gm', 'Gmail', 'messages', 9.6, 12],
  ['com.instagram.android', 'Instagram', 'social', 12.4, 42],
  ['com.reddit.frontpage', 'Reddit', 'social', 14.1, 26],
  ['com.whatsapp', 'WhatsApp', 'messages', 16.5, 16],
  ['com.google.android.youtube', 'YouTube', 'fun', 18.2, 33],
  ['com.spotify.music', 'Spotify', 'fun', 19.4, 8],
  ['com.instagram.android', 'Instagram', 'social', 20.1, 10]
];

/** Dev only: a realistic day for UI work on an emulator with no history. */
export function seedSampleDay(db: Db, nowMs: number): void {
  const day = localDate(nowMs);
  const [y, m, d] = day.split('-').map(Number);
  const startOf = (h: number) => new Date(y, m - 1, d).getTime() + Math.round(h * 3_600_000);
  db.tx(() => {
    for (const [pkg, label, cat, h, min] of SAMPLE) {
      const start = startOf(h);
      if (start > nowMs) continue;
      db.run('INSERT OR IGNORE INTO apps (package, label, category) VALUES (?, ?, ?)', [pkg, label, cat]);
      db.run('INSERT OR IGNORE INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [pkg, start, Math.min(nowMs, start + min * 60_000), day]);
    }
    for (let i = 0; i < 46; i++) {
      const t = startOf(7.2 + i * 0.3);
      if (t <= nowMs) db.run('INSERT OR IGNORE INTO pickups (ts_ms, day) VALUES (?, ?)', [t, day]);
    }
  });
}
