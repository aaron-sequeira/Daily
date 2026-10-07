import { localDate } from '@worksight/core/date';
import { clock12 } from '@worksight/core/reminders';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const noon = (day: string, plus = 0) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d + plus, 12); };

/** The local day `n` days from `day`. Built from the calendar date at noon, so a DST change can't slip it. */
export function shiftDay(day: string, n: number): string {
  return localDate(noon(day, n).getTime());
}

/** Monday of the week holding `day` (spec §10.3: Monday-start weeks). */
export function weekStartOf(day: string): string {
  return shiftDay(day, -((noon(day).getDay() + 6) % 7));
}

export function weekdayShort(day: string): string {
  return DAYS[noon(day).getDay()];
}

/** "Mon 5 Oct" */
export function dayLabel(day: string): string {
  const d = noon(day);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Local time of day as 'HH:MM'. */
export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "11 pm", "9:30 am" */
export function clockShort(t: string): string {
  return clock12(t).replace(':00 ', ' ');
}

/** "9:10–11:40 am", "11:10 am–1:40 pm" */
export function timeRange(from: string, to: string): string {
  const a = clockShort(from);
  const b = clockShort(to);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

const WRITE_FIRST = 17 * 60;
const WRITE_LAST = 23 * 60 + 30;
const minutesOf = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** "Write it at": 5:00 pm … 11:30 pm in 30-minute steps (an earlier report would miss most of the day). */
export const canStepWriteTime = (t: string, dir: -1 | 1): boolean => (dir < 0 ? minutesOf(t) > WRITE_FIRST : minutesOf(t) < WRITE_LAST);
export function stepWriteTime(t: string, dir: -1 | 1): string {
  const m = Math.min(WRITE_LAST, Math.max(WRITE_FIRST, Math.round(minutesOf(t) / 30) * 30 + dir * 30));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
