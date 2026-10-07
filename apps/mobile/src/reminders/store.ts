import { localDate } from '@worksight/core/date';
import { LIMITS, validateReminder, type Animation, type Reminder, type ReminderInput, type Schedule } from '@worksight/core/reminders';
import type { Db } from '../db/db';
import { mobileDefaults } from './defaults';

type Row = { id: number; builtin: string | null; name: string; message: string; animation: string; schedule: string; break_sec: number; enabled: number };
export type ReminderState = { lastFiredAt: number | null; lastDoneAt: number | null; skipDate: string | null };

const toReminder = (r: Row): Reminder => ({
  id: r.id, builtin: r.builtin as Reminder['builtin'], name: r.name, message: r.message, animation: r.animation as Animation,
  schedule: JSON.parse(r.schedule) as Schedule, breakSec: r.break_sec, enabled: r.enabled === 1
});

/** Built-ins first (water, lunch, tea, dinner), then the user's own. Seeds the built-ins on first use and after Delete everything. */
export function listReminders(db: Db): Reminder[] {
  if (!db.get('SELECT 1 AS x FROM reminders WHERE builtin IS NOT NULL LIMIT 1')) {
    // INSERT OR IGNORE on the unique builtin column keeps this idempotent without a transaction (callers may be inside one).
    for (const d of mobileDefaults()) {
      db.run('INSERT OR IGNORE INTO reminders (builtin, name, message, animation, schedule, break_sec, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [d.builtin, d.name, d.message, d.animation, JSON.stringify(d.schedule), d.breakSec, d.enabled ? 1 : 0]);
    }
  }
  return db.all<Row>('SELECT * FROM reminders ORDER BY builtin IS NULL, id').map(toReminder);
}

export function getReminder(db: Db, id: number): Reminder | null {
  const r = db.get<Row>('SELECT * FROM reminders WHERE id = ?', [id]);
  return r ? toReminder(r) : null;
}

export function saveReminder(db: Db, input: ReminderInput): { ok: true; id: number } | { ok: false; error: string } {
  const error = validateReminder(input);
  if (error) return { ok: false, error };
  const vals = [input.name.trim(), input.message.trim(), input.animation, JSON.stringify(input.schedule), input.breakSec];
  if (input.id) {
    db.run('UPDATE reminders SET name = ?, message = ?, animation = ?, schedule = ?, break_sec = ? WHERE id = ?', [...vals, input.id]);
    return { ok: true, id: input.id };
  }
  const customs = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM reminders WHERE builtin IS NULL')?.n ?? 0;
  if (customs >= LIMITS.custom) return { ok: false, error: 'You can have up to 20 of your own reminders.' };
  db.run('INSERT INTO reminders (builtin, name, message, animation, schedule, break_sec, enabled) VALUES (NULL, ?, ?, ?, ?, ?, 1)', vals);
  return { ok: true, id: db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id };
}

export function setEnabled(db: Db, id: number, on: boolean): void {
  db.run('UPDATE reminders SET enabled = ? WHERE id = ?', [on ? 1 : 0, id]);
}

/** Onboarding's "Not now": keep the built-ins but switch them off; the user can turn them on in Reminders. */
export function turnOffBuiltins(db: Db): void {
  listReminders(db); // seeds the built-ins if this is a fresh database
  db.run('UPDATE reminders SET enabled = 0 WHERE builtin IS NOT NULL');
}

/** Only the user's own reminders can be deleted. */
export function deleteReminder(db: Db, id: number): boolean {
  if (!db.get('SELECT 1 AS x FROM reminders WHERE id = ? AND builtin IS NULL', [id])) return false;
  db.run('DELETE FROM reminders WHERE id = ?', [id]);
  db.run('DELETE FROM reminder_state WHERE id = ?', [id]);
  return true;
}

export function getStates(db: Db): Map<number, ReminderState> {
  const rows = db.all<{ id: number; last_fired_at: number | null; last_done_at: number | null; skip_date: string | null }>('SELECT * FROM reminder_state');
  return new Map(rows.map((r) => [r.id, { lastFiredAt: r.last_fired_at, lastDoneAt: r.last_done_at, skipDate: r.skip_date }]));
}

function setState(db: Db, id: number, column: 'last_fired_at' | 'last_done_at' | 'skip_date', value: number | string): void {
  db.run(`INSERT INTO reminder_state (id, ${column}) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET ${column} = excluded.${column}`, [id, value]);
}

export const markFired = (db: Db, id: number, nowMs: number) => setState(db, id, 'last_fired_at', nowMs);
export const markDone = (db: Db, id: number, nowMs: number) => setState(db, id, 'last_done_at', nowMs);
export const skipToday = (db: Db, id: number, nowMs: number) => setState(db, id, 'skip_date', localDate(nowMs));

export function logWater(db: Db, nowMs: number): void {
  db.run('INSERT OR IGNORE INTO water_log (ts_ms, day) VALUES (?, ?)', [nowMs, localDate(nowMs)]);
}

export function waterToday(db: Db, nowMs: number): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM water_log WHERE day = ?', [localDate(nowMs)])?.n ?? 0;
}
