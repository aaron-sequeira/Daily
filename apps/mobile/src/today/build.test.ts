import { describe, expect, it } from 'vitest';
import { buildToday, type TodayInput } from './build';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();
const apps: TodayInput['apps'] = [
  { package: 'com.instagram.android', label: 'Instagram', category: 'social', user_category: null, icon_png: null },
  { package: 'com.whatsapp', label: 'WhatsApp', category: 'messages', user_category: null, icon_png: 'abc' },
  { package: 'com.duolingo', label: 'Duolingo', category: 'learning', user_category: 'fun', icon_png: null }
];
const base: TodayInput = {
  day: '2026-10-06', nowMs: at(21), goalMin: 240, open: null, pickups: [at(7, 12), at(9)], apps,
  sessions: [
    { package: 'com.instagram.android', start_ms: at(12), end_ms: at(13) },
    { package: 'com.whatsapp', start_ms: at(8), end_ms: at(8, 30) },
    { package: 'com.duolingo', start_ms: at(8, 30), end_ms: at(8, 45) }
  ]
};

describe('buildToday', () => {
  it('totals phone time, pickups and the first pickup', () => {
    const v = buildToday(base);
    expect(v.phoneMin).toBe(105);
    expect(v.pickups).toBe(2);
    expect(v.firstPickupMs).toBe(at(7, 12));
    expect(v.empty).toBe(false);
  });

  it('a totals-only day (phone keeps no event log) has minutes but no timeline or first pickup', () => {
    const v = buildToday({ ...base, totalsOnly: true });
    expect(v.phoneMin).toBe(105);
    expect(v.pickups).toBe(2);
    expect(v.firstPickupMs).toBeNull();
    expect(v.timeline.segments).toEqual([]);
    expect(v.totalsOnly).toBe(true);
  });

  it('groups by category (user override wins), biggest first, with shares', () => {
    const v = buildToday(base);
    expect(v.categories.map((c) => [c.id, c.minutes])).toEqual([['social', 60], ['messages', 30], ['fun', 15]]);
    expect(v.categories[0].share).toBeCloseTo(60 / 105);
    expect(v.categories[1].apps[0]).toEqual({ pkg: 'com.whatsapp', label: 'WhatsApp', minutes: 30, icon: 'abc' });
  });

  it('counts the open app up to now', () => {
    const v = buildToday({ ...base, open: { pkg: 'com.whatsapp', startMs: at(20, 30) } });
    expect(v.phoneMin).toBe(135);
  });

  it('counts an open app from midnight if it opened yesterday', () => {
    const v = buildToday({ ...base, sessions: [], nowMs: at(0, 20), open: { pkg: 'com.whatsapp', startMs: at(0) - 600_000 } });
    expect(v.phoneMin).toBe(20);
  });

  it('labels an unknown app by package and files it under other (Review Focus 4)', () => {
    const v = buildToday({ ...base, apps: [], sessions: [{ package: 'gone.app', start_ms: at(9), end_ms: at(9, 10) }] });
    expect(v.categories).toEqual([{ id: 'other', minutes: 10, share: 1, apps: [{ pkg: 'gone.app', label: 'gone.app', minutes: 10, icon: null }] }]);
  });

  it('updates the mood and goal left when the goal changes (Review Focus 5)', () => {
    expect(buildToday(base).mood).toBe('glowing'); // 105 of 240
    const tight = buildToday({ ...base, goalMin: 90 });
    expect(tight.mood).toBe('fading');             // 105 of 90
    expect(tight.leftMin).toBe(-15);
  });

  it('builds a timeline from 7 am (or earlier use) to midnight', () => {
    const v = buildToday(base);
    expect(v.timeline.startH).toBe(7);
    expect(v.timeline.ticks.map((t) => t.label)).toEqual(['7 am', '11 am', '3 pm', '7 pm', '11 pm']);
    const insta = v.timeline.segments.find((s) => s.category === 'social')!;
    expect(insta.left).toBeCloseTo(((12 - 7) / 17) * 100);
    expect(insta.width).toBeCloseTo((1 / 17) * 100);
    expect(v.timeline.nowAt).toBeCloseTo(((21 - 7) / 17) * 100);
    const early = buildToday({ ...base, sessions: [{ package: 'com.whatsapp', start_ms: at(5, 40), end_ms: at(6) }] });
    expect(early.timeline.startH).toBe(5);
  });

  it('marks an empty day (Review Focus 3)', () => {
    const v = buildToday({ ...base, sessions: [], pickups: [] });
    expect(v.empty).toBe(true);
    expect(v.categories).toEqual([]);
    expect(v.mood).toBe('glowing');
  });

  it('positions now at 0 on an empty day before 7am', () => {
    const v = buildToday({ ...base, sessions: [], pickups: [], nowMs: at(3) });
    expect(v.timeline.startH).toBe(3);
    expect(v.timeline.nowAt).toBeCloseTo(0);
  });
});
