import { describe, expect, it } from 'vitest';
import { INITIAL_STATE, dayStartMs, ingest, splitAtMidnight, type RawEvent } from './ingest';

const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();
const none = new Set<string>();

describe('ingest', () => {
  it('pairs resume and pause into a session', () => {
    const ev: RawEvent[] = [
      { type: 'resumed', pkg: 'com.a', ts: at(9) },
      { type: 'paused', pkg: 'com.a', ts: at(9, 20) }
    ];
    const r = ingest(ev, INITIAL_STATE, none);
    expect(r.sessions).toEqual([{ pkg: 'com.a', startMs: at(9), endMs: at(9, 20), day: '2026-10-06' }]);
    expect(r.state).toEqual({ lastEventMs: at(9, 20), openPkg: null, openStartMs: null });
  });

  it('closes the current app when another resumes', () => {
    const ev: RawEvent[] = [
      { type: 'resumed', pkg: 'com.a', ts: at(9) },
      { type: 'resumed', pkg: 'com.b', ts: at(9, 5) },
      { type: 'paused', pkg: 'com.a', ts: at(9, 5) },
      { type: 'paused', pkg: 'com.b', ts: at(9, 8) }
    ];
    const r = ingest(ev, INITIAL_STATE, none);
    expect(r.sessions.map((s) => [s.pkg, s.endMs - s.startMs])).toEqual([['com.a', 5 * 60_000], ['com.b', 3 * 60_000]]);
  });

  it('closes on screen off and counts unlocks as pickups', () => {
    const ev: RawEvent[] = [
      { type: 'unlock', pkg: 'android', ts: at(8) },
      { type: 'screen_on', pkg: 'android', ts: at(8) },
      { type: 'resumed', pkg: 'com.a', ts: at(8, 1) },
      { type: 'screen_off', pkg: 'android', ts: at(8, 11) }
    ];
    const r = ingest(ev, INITIAL_STATE, none);
    expect(r.pickups).toEqual([at(8)]);
    expect(r.sessions).toHaveLength(1);
    expect(r.sessions[0].endMs).toBe(at(8, 11));
    expect(r.state.openPkg).toBeNull();
  });

  it('never records ignored apps but lets them close the previous app', () => {
    const ev: RawEvent[] = [
      { type: 'resumed', pkg: 'com.a', ts: at(9) },
      { type: 'resumed', pkg: 'launcher', ts: at(9, 4) },
      { type: 'paused', pkg: 'launcher', ts: at(9, 6) }
    ];
    const r = ingest(ev, INITIAL_STATE, new Set(['launcher']));
    expect(r.sessions.map((s) => s.pkg)).toEqual(['com.a']);
    expect(r.state.openPkg).toBeNull();
  });

  it('splits a session at local midnight (Review Focus 2)', () => {
    const ev: RawEvent[] = [
      { type: 'resumed', pkg: 'com.a', ts: at(23, 30, 6) },
      { type: 'paused', pkg: 'com.a', ts: at(0, 30, 7) }
    ];
    const r = ingest(ev, INITIAL_STATE, none);
    expect(r.sessions.map((s) => [s.day, (s.endMs - s.startMs) / 60_000])).toEqual([['2026-10-06', 30], ['2026-10-07', 30]]);
  });

  it('carries an open app across batches', () => {
    const first = ingest([{ type: 'resumed', pkg: 'com.a', ts: at(10) }], INITIAL_STATE, none);
    expect(first.sessions).toEqual([]);
    expect(first.state).toEqual({ lastEventMs: at(10), openPkg: 'com.a', openStartMs: at(10) });
    const second = ingest([{ type: 'paused', pkg: 'com.a', ts: at(10, 15) }], first.state, none);
    expect(second.sessions).toEqual([{ pkg: 'com.a', startMs: at(10), endMs: at(10, 15), day: '2026-10-06' }]);
  });

  it('skips events already processed and sorts the rest (Review Focus 1)', () => {
    const ev: RawEvent[] = [
      { type: 'paused', pkg: 'com.a', ts: at(9, 20) },
      { type: 'resumed', pkg: 'com.a', ts: at(9) }
    ];
    const once = ingest(ev, INITIAL_STATE, none);
    expect(once.sessions).toHaveLength(1);
    const again = ingest(ev, once.state, none);
    expect(again.sessions).toEqual([]);
    expect(again.pickups).toEqual([]);
  });
});

describe('splitAtMidnight / dayStartMs', () => {
  it('returns one piece inside a day', () => {
    expect(splitAtMidnight('com.a', at(9), at(10))).toHaveLength(1);
  });

  it('finds local midnight of a day key', () => {
    expect(dayStartMs('2026-10-06')).toBe(at(0, 0, 6));
  });
});
