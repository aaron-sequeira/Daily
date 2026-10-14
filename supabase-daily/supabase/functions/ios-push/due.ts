/** What the phone uploads (src/island/push.ts builds it): its day plan and the Live Activity state to show for each
 * event, already worked out on the phone. The server only decides *when* to push, in the user's own time zone. */
export type IslandStateJson = Record<string, unknown>;
export type IosSchedule = {
  tz: string;
  /** "HH:MM" local times */
  morning: string; windDown: string; writeTime: string;
  progress: IslandStateJson; report: IslandStateJson;
  /** clock reminders only; days are 1 = Monday … 7 = Sunday */
  reminders: { id: number; time: string; days: number[]; state: IslandStateJson; title: string; body: string }[];
};

export type PushAction = 'start' | 'update' | 'end';
export type DueEvent = { key: string; action: PushAction; state?: IslandStateJson; alert?: { title: string; body: string } };

/** An event stays due this long, so a late or skipped cron tick still sends it; its key stops a repeat. */
export const DUE_WINDOW_MIN = 10;
const BACK_AFTER_MIN = 30;
const DAY_MIN = 24 * 60;

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** The local date, minute of the day and weekday (1 = Monday) at `nowMs` in `tz` (UTC if the zone is unknown). */
export function localNow(nowMs: number, tz: string): { date: string; minute: number; weekday: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(nowMs);
  } catch {
    return localNow(nowMs, 'UTC');
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: Number(get('hour')) * 60 + Number(get('minute')), weekday: WEEKDAY[get('weekday')] ?? 1 };
}

const minuteOf = (hhmm: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** What to push now. `hasActivity`: the phone has a running "Sunny today" activity (it reported an update token). */
export function dueEvents(s: IosSchedule, nowMs: number, hasActivity: boolean): DueEvent[] {
  const { date, minute, weekday } = localNow(nowMs, s.tz);
  const due = (at: number | null) => at !== null && at < DAY_MIN && minute >= at && minute < at + DUE_WINDOW_MIN;
  const show = (key: string, state: IslandStateJson, alert?: DueEvent['alert']): DueEvent =>
    ({ key, action: hasActivity ? 'update' : 'start', state, ...(alert ? { alert } : {}) });
  const out: DueEvent[] = [];

  if (!hasActivity && due(minuteOf(s.morning))) out.push({ key: `start:${date}`, action: 'start', state: s.progress });

  for (const r of s.reminders) {
    if (!r.days.includes(weekday)) continue;
    const at = minuteOf(r.time);
    if (due(at)) out.push(show(`rem:${r.id}:${date}`, r.state, { title: r.title, body: r.body }));
    if (hasActivity && at !== null && due(at + BACK_AFTER_MIN)) out.push({ key: `back:${r.id}:${date}`, action: 'update', state: s.progress });
  }

  const write = minuteOf(s.writeTime);
  if (due(write)) out.push(show(`report:${date}`, s.report));

  // End at wind-down, but never before the report has had 30 minutes on screen.
  const wind = minuteOf(s.windDown);
  const end = wind === null ? null : write !== null && write >= wind ? write + BACK_AFTER_MIN : wind;
  if (hasActivity && due(end)) out.push({ key: `end:${date}`, action: 'end' });

  return out;
}
