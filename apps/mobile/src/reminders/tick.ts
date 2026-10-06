import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import { phoneMsSince } from '../tracking/sync';
import { reminderContent, type Notifier } from './notifier';
import { dueIntervalReminders, planClockSlots } from './plan';
import { getStates, listReminders, markFired } from './store';

// A force-stop or OEM kill cancels AlarmManager alarms while expo still lists their keys, so the plan signature
// alone can't tell the alarms are gone. Each new process (app open or background task) re-arms them once.
let armedThisProcess = false;
export function resetArmedForTests(): void { armedThisProcess = false; }

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
  let replanned = signature !== getSetting(db, 'clock_plan') || !armedThisProcess;
  if (replanned) {
    try {
      for (const key of await notifier.scheduledKeys()) if (key.startsWith('rem-')) await notifier.cancel(key);
      for (const s of slots) await notifier.scheduleAt(s.key, reminderContent(byId.get(s.reminderId)!), s.atMs);
      setSetting(db, 'clock_plan', signature);
      armedThisProcess = true;
    } catch (e) {
      console.warn('daily: re-planning reminders failed', e);
      replanned = false;
    }
  }

  const due = dueIntervalReminders(reminders, states, nowMs, (fromMs) => phoneMsSince(db, fromMs, nowMs));
  const canNotify = await notifier.canNotify().catch(() => false);
  const fired: number[] = [];
  if (canNotify) {
    for (const r of due) {
      try {
        await notifier.showNow(`now-${r.id}`, reminderContent(r));
        markFired(db, r.id, nowMs);
        fired.push(r.id);
      } catch (e) {
        console.warn('daily: showing reminder failed', e);
      }
    }
  }
  return { replanned, fired };
}
