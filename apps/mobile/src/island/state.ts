import { localDate } from '@worksight/core/date';
import type { Reminder } from '@worksight/core/reminders';
import { ANIM_LOOK, sceneKind, type MobileAnimation } from '../reminders/defaults';
import { nextUp, planClockSlots } from '../reminders/plan';
import type { ReminderState } from '../reminders/store';
import type { StoredReport } from '../report/store';

export type IslandPhase = 'progress' | 'reminder' | 'break' | 'report';
/** Sent to Swift as JSON; the keys must match SunnyAttributes.ContentState in SunnyShared.swift. */
export type IslandState = {
  phase: IslandPhase; mood: 'happy' | 'glowing' | 'alright'; title: string; line: string;
  /** '' = Swift shows the live timer to timerEndMs. */
  compact: string;
  timerStartMs: number | null; timerEndMs: number | null; color: string; icon: string; reminderId: number | null; canBreak: boolean;
};
export type BreakNow = { reminderId: number | null; startMs: number; totalSec: number };
export type IslandInputs = {
  reminders: Reminder[]; states: Map<number, ReminderState>;
  /** reminderId → when Done/Snooze was pressed in the Island */
  handled: Record<number, number>;
  brk: BreakNow | null; report: StoredReport | null; reportSeen: boolean;
};

const PENDING_MS = 30 * 60_000;
const AMBER = '#F6B35E';
const SYMBOL: Record<MobileAnimation, string> = { water: 'drop.fill', meal: 'fork.knife', tea: 'cup.and.saucer.fill', dinner: 'moon.fill', stretch: 'figure.walk' };

const clock = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** A clock reminder whose time passed in the last 30 minutes today, not done or handled since. */
export function pendingReminder(i: IslandInputs, nowMs: number): { reminder: Reminder; atMs: number } | null {
  const slots = planClockSlots(i.reminders, i.states, nowMs - PENDING_MS, 1)
    .filter((s) => s.atMs <= nowMs && localDate(s.atMs) === localDate(nowMs))
    .filter((s) => (i.states.get(s.reminderId)?.lastDoneAt ?? 0) < s.atMs && (i.handled[s.reminderId] ?? 0) < s.atMs);
  const last = slots[slots.length - 1];
  const reminder = last && i.reminders.find((r) => r.id === last.reminderId);
  return reminder ? { reminder, atMs: last.atMs } : null;
}

function progress(i: IslandInputs, nowMs: number): IslandState {
  const next = nextUp(i.reminders, i.states, nowMs, () => 0); // ponytail: no phone time on iOS until Screen Time (i2)
  let line = 'No more reminders today';
  let timerEndMs: number | null = null;
  if (next?.kind === 'clock' && localDate(next.atMs) === localDate(nowMs)) { line = `${next.reminder.name} at ${clock(next.atMs)}`; timerEndMs = next.atMs; }
  else if (next?.kind === 'interval') line = `${next.reminder.name} after ${next.leftMin}m on your phone`;
  return { phase: 'progress', mood: 'happy', title: 'Sunny today', line, compact: '', timerStartMs: null, timerEndMs, color: AMBER, icon: 'sun.max.fill', reminderId: null, canBreak: false };
}

export function pickIsland(i: IslandInputs, nowMs: number): { state: IslandState; fallback: IslandState } {
  const fallback = progress(i, nowMs);
  const pick = (): IslandState => {
    if (i.brk) {
      const r = i.reminders.find((x) => x.id === i.brk!.reminderId);
      const look = r ? ANIM_LOOK[sceneKind(r.animation)] : null;
      return { phase: 'break', mood: 'alright', title: look?.breakTitle ?? 'Break', line: 'Back in a few minutes', compact: '',
        timerStartMs: i.brk.startMs, timerEndMs: i.brk.startMs + i.brk.totalSec * 1000, color: look?.color ?? AMBER, icon: 'sun.max.fill', reminderId: i.brk.reminderId, canBreak: false };
    }
    const p = pendingReminder(i, nowMs);
    if (p) {
      const kind = sceneKind(p.reminder.animation);
      return { phase: 'reminder', mood: 'happy', title: p.reminder.name, line: p.reminder.message, compact: 'now', timerStartMs: null, timerEndMs: null,
        color: ANIM_LOOK[kind].color, icon: SYMBOL[kind], reminderId: p.reminder.id, canBreak: p.reminder.breakSec > 0 };
    }
    if (i.report && !i.reportSeen) {
      return { phase: 'report', mood: 'glowing', title: 'Your day is written', line: i.report.headline || 'Tap to write today’s story', compact: 'Ready',
        timerStartMs: null, timerEndMs: null, color: '#D8D2FC', icon: 'pencil', reminderId: null, canBreak: false };
    }
    return fallback;
  };
  return { state: pick(), fallback };
}
