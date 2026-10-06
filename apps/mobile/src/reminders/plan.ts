import { localDate } from '@worksight/core/date';
import { localDayOf, type Reminder } from '@worksight/core/reminders';
import type { ReminderState } from './store';

export type ClockSlot = { key: string; reminderId: number; atMs: number };
export type NextUp = { reminder: Reminder; kind: 'clock'; atMs: number } | { reminder: Reminder; kind: 'interval'; leftMin: number };

const midnightOf = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0);

/** Local fire times of every enabled clock reminder from now through `days` days. Planned in the current zone, so
 * re-planning after a time-zone or DST change moves every alarm to the right local time. */
export function planClockSlots(reminders: Reminder[], states: Map<number, ReminderState>, nowMs: number, days = 7): ClockSlot[] {
  const out: ClockSlot[] = [];
  const first = new Date(midnightOf(nowMs));
  for (let i = 0; i < days; i++) {
    const day = new Date(first);
    day.setDate(first.getDate() + i); // calendar stepping, not +24 h, so DST days stay right
    const dayMs = day.getTime();
    const dayKey = localDate(dayMs);
    const dow = localDayOf(dayMs);
    for (const r of reminders) {
      if (!r.enabled || r.schedule.type !== 'time' || !r.schedule.days.includes(dow)) continue;
      if (states.get(r.id)?.skipDate === dayKey) continue;
      const [h, m] = r.schedule.time.split(':').map(Number);
      const atMs = new Date(dayMs).setHours(h, m, 0, 0);
      if (atMs > nowMs) out.push({ key: `rem-${r.id}-${dayKey}`, reminderId: r.id, atMs });
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

const intervalFrom = (r: Reminder, s: ReminderState | undefined, nowMs: number): number =>
  Math.max(midnightOf(nowMs), s?.lastFiredAt ?? 0, s?.lastDoneAt ?? 0);

/** Phone-time reminders with enough phone time since the later of local midnight, their last fire and last done. */
export function dueIntervalReminders(reminders: Reminder[], states: Map<number, ReminderState>, nowMs: number, phoneMsSince: (fromMs: number) => number): Reminder[] {
  return reminders.filter((r) => r.enabled && r.schedule.type === 'interval'
    && phoneMsSince(intervalFrom(r, states.get(r.id), nowMs)) >= r.schedule.minutes * 60_000);
}

/** The Reminders tab's "Next up": a clock reminder still to come today, else the phone-time reminder closest to due,
 * else the next clock reminder on a later day. */
export function nextUp(reminders: Reminder[], states: Map<number, ReminderState>, nowMs: number, phoneMsSince: (fromMs: number) => number): NextUp | null {
  const byId = new Map(reminders.map((r) => [r.id, r]));
  const slots = planClockSlots(reminders, states, nowMs, 8);
  const today = slots.find((s) => localDate(s.atMs) === localDate(nowMs));
  if (today) return { reminder: byId.get(today.reminderId)!, kind: 'clock', atMs: today.atMs };
  let best: NextUp | null = null;
  for (const r of reminders) {
    if (!r.enabled || r.schedule.type !== 'interval') continue;
    const leftMin = Math.max(0, Math.round(r.schedule.minutes - phoneMsSince(intervalFrom(r, states.get(r.id), nowMs)) / 60_000));
    if (!best || (best.kind === 'interval' && leftMin < best.leftMin)) best = { reminder: r, kind: 'interval', leftMin };
  }
  if (best) return best;
  return slots[0] ? { reminder: byId.get(slots[0].reminderId)!, kind: 'clock', atMs: slots[0].atMs } : null;
}
