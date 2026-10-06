import { localDate } from '@worksight/core/date';

export type RawEvent = { type: 'resumed' | 'paused' | 'screen_on' | 'screen_off' | 'unlock'; pkg: string; ts: number };
export type IngestState = { lastEventMs: number; openPkg: string | null; openStartMs: number | null };
export type Session = { pkg: string; startMs: number; endMs: number; day: string };

export const INITIAL_STATE: IngestState = { lastEventMs: 0, openPkg: null, openStartMs: null };

/** Local midnight at the start of a YYYY-MM-DD day key. */
export function dayStartMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function nextMidnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function splitAtMidnight(pkg: string, startMs: number, endMs: number): Session[] {
  const out: Session[] = [];
  for (let s = startMs; s < endMs;) {
    const cut = Math.min(endMs, nextMidnight(s));
    out.push({ pkg, startMs: s, endMs: cut, day: localDate(s) });
    s = cut;
  }
  return out;
}

/**
 * Turns Android usage events into finished sessions and pickups. Pure: the caller stores the result and the new state.
 * ponytail: events with a timestamp equal to the cursor are treated as already seen; Android rarely writes two events
 * in the same millisecond across a query boundary, and the sessions unique index catches any repeat.
 */
export function ingest(events: RawEvent[], state: IngestState, ignore: ReadonlySet<string>) {
  const sessions: Session[] = [];
  const pickups: number[] = [];
  let { lastEventMs, openPkg, openStartMs } = state;

  const close = (end: number) => {
    if (openPkg !== null && openStartMs !== null && end > openStartMs) sessions.push(...splitAtMidnight(openPkg, openStartMs, end));
    openPkg = null;
    openStartMs = null;
  };

  const fresh = events.filter((e) => e.ts > lastEventMs).sort((a, b) => a.ts - b.ts);
  for (const e of fresh) {
    if (e.type === 'resumed' && e.pkg !== openPkg) {
      close(e.ts);
      if (!ignore.has(e.pkg)) { openPkg = e.pkg; openStartMs = e.ts; }
    } else if (e.type === 'paused' && e.pkg === openPkg) {
      close(e.ts);
    } else if (e.type === 'screen_off') {
      close(e.ts);
    } else if (e.type === 'unlock') {
      pickups.push(e.ts);
    }
    lastEventMs = e.ts;
  }
  return { sessions, pickups, state: { lastEventMs, openPkg, openStartMs } };
}
