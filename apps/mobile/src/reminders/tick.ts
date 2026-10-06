import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import { phoneMsSince } from '../tracking/sync';
import { reminderContent, type Notifier } from './notifier';
import { dueIntervalReminders, planClockSlots } from './plan';
import { getStates, listReminders, markFired } from './store';

/** Keeps the OS alarms equal to the 7-day clock plan (touching them only when the plan changed) and fires any
 * phone-time reminder that is due. Called after every sync. */
export async function tickReminders(db: Db, notifier: Notifier, nowMs: number): Promise<{ replanned: boolean; fired: number[] }> {
  const reminders = listReminders(db);
  const states = getStates(db);
  const byId = new Map(reminders.map((r) => [r.id, r]));

  const slots = planClockSlots(reminders, states, nowMs);
  const signature = slots.map((s) => {
    const c = reminderContent(byId.get(s.reminderId)!);
    return `${s.key}@${s.atMs}:${c.title}|${c.body}|${c.category}`;
  }).join('\n');
  const replanned = signature !== getSetting(db, 'clock_plan');
  if (replanned) {
    for (const key of await notifier.scheduledKeys()) if (key.startsWith('rem-')) await notifier.cancel(key);
    for (const s of slots) await notifier.scheduleAt(s.key, reminderContent(byId.get(s.reminderId)!), s.atMs);
    setSetting(db, 'clock_plan', signature);
  }

  const due = dueIntervalReminders(reminders, states, nowMs, (fromMs) => phoneMsSince(db, fromMs, nowMs));
  for (const r of due) {
    await notifier.showNow(`now-${r.id}`, reminderContent(r));
    markFired(db, r.id, nowMs);
  }
  return { replanned, fired: due.map((r) => r.id) };
}
