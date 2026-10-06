import { LIMITS, type Reminder, type ReminderInput } from '@worksight/core/reminders';
import { formatDuration } from '../format';
import { sceneKind, type MobileAnimation } from './defaults';

export type Form = { name: string; message: string; animation: MobileAnimation; type: 'time' | 'interval'; time: string; days: number[]; minutes: number; breakSec: number };

export const BREAK_CHOICES = [0, 30, 60, 300, 900, 1800];

export function breakLabel(sec: number): string {
  if (sec === 0) return 'No break';
  return sec < 60 ? `${sec} s` : `${sec / 60} min`;
}

export function formFrom(r: Reminder | null): Form {
  if (!r) return { name: '', message: '', animation: 'stretch', type: 'interval', time: '10:00', days: [1, 2, 3, 4, 5], minutes: 45, breakSec: 0 };
  return {
    name: r.name, message: r.message, animation: sceneKind(r.animation), type: r.schedule.type,
    time: r.schedule.type === 'time' ? r.schedule.time : '10:00',
    days: r.schedule.type === 'time' ? [...r.schedule.days] : [1, 2, 3, 4, 5],
    minutes: r.schedule.type === 'interval' ? r.schedule.minutes : 45,
    breakSec: r.breakSec
  };
}

export function toInput(f: Form, id?: number): ReminderInput {
  return {
    ...(id ? { id } : {}),
    name: f.name, message: f.message, animation: f.animation,
    schedule: f.type === 'time' ? { type: 'time', time: f.time, days: f.days } : { type: 'interval', minutes: f.minutes },
    breakSec: f.breakSec
  };
}

export function stepTime(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + deltaMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function toggleDay(days: number[], d: number): number[] {
  return (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]).sort((a, b) => a - b);
}

export function stepMinutes(min: number, delta: number): number {
  return Math.min(LIMITS.intervalMax, Math.max(LIMITS.intervalMin, min + delta));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayStart = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** When the next clock reminder fires, in plain words, in the phone's local time. */
export function nextUpWhen(atMs: number, nowMs: number): string {
  const mins = Math.floor((atMs - nowMs) / 60_000);
  if (mins < 1) return 'now';
  const dayDiff = Math.round((dayStart(atMs) - dayStart(nowMs)) / 86_400_000);
  if (dayDiff === 0) return `in ${formatDuration(mins)}`;
  if (dayDiff === 1) return 'tomorrow';
  return `on ${WEEKDAYS[new Date(atMs).getDay()]}`;
}

export function nextUpLeft(leftMin: number): string {
  return leftMin <= 0 ? 'due now' : `after ${formatDuration(leftMin)} more of phone time`;
}
