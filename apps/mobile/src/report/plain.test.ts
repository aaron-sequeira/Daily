import { describe, expect, it } from 'vitest';
import type { ReportInput } from './input';
import { plainReport } from './plain';

const base = (over: Partial<ReportInput> = {}): ReportInput => ({
  day: '2026-10-06', goalMin: 240, phoneMin: 92, pickups: 3,
  apps: [
    { name: 'Instagram', category: 'social', minutes: 42, opens: 1 },
    { name: 'WhatsApp', category: 'messages', minutes: 30, opens: 3 },
    { name: 'Duolingo', category: 'learning', minutes: 20, opens: 1 }
  ],
  categories: { social: 42, messages: 30, learning: 20 },
  hourly: Array(24).fill(0),
  longest: { app: 'Instagram', category: 'social', minutes: 42, start: '12:10' },
  quietest: { from: '12:52', to: '23:10', minutes: 618 },
  late: { after: '23:00', minutes: 15 },
  moods: [], water: 2, last7: [], yesterdayPlan: [],
  ...over
});

describe('plainReport (spec §10.2)', () => {
  it('writes a headline, four highlights and two tips', () => {
    expect(plainReport(base())).toEqual({
      headline: '1h 32m on your phone, 2h 28m under your 4h goal.',
      highlights: [
        { kind: 'quiet', label: 'Quietest stretch', value: '12:52–11:10 pm' },
        { kind: 'opened', label: 'Most opened', value: 'WhatsApp · 3×' },
        { kind: 'longest', label: 'Longest scroll', value: 'Instagram · 42m' },
        { kind: 'late', label: 'After 11 pm', value: '15m' }
      ],
      tomorrow: ['Leave Instagram after 20 minutes', 'Phone away by 11 pm']
    });
  });

  it('compares with the recent average once there are three days of it', () => {
    const last7 = [{ day: '2026-10-03', phoneMin: 200 }, { day: '2026-10-04', phoneMin: 190 }, { day: '2026-10-05', phoneMin: 210 }];
    expect(plainReport(base({ phoneMin: 150, last7 })).headline).toBe('A calmer day: 2h 30m, 50m under your average.');
    expect(plainReport(base({ phoneMin: 260, last7 })).headline).toBe('A busier day: 4h 20m, 1h over your average.');
    expect(plainReport(base({ phoneMin: 205, last7 })).headline).toBe('3h 25m on your phone, 35m under your 4h goal.');
    expect(plainReport(base({ phoneMin: 150, last7: last7.slice(0, 2) })).headline).toBe('2h 30m on your phone, 1h 30m under your 4h goal.');
    expect(plainReport(base({ phoneMin: 240 })).headline).toBe('4h on your phone, right on your goal.');
  });

  it('describes an empty day and falls back to gentle tips', () => {
    expect(plainReport(base({ phoneMin: 0, apps: [], categories: {}, longest: null, quietest: null, late: { after: '23:00', minutes: 0 } }))).toEqual({
      headline: 'A quiet day: no phone time recorded.',
      highlights: [{ kind: 'late', label: 'After 11 pm', value: 'None' }],
      tomorrow: ['Keep a phone-free hour in the morning', 'Take a short walk without your phone']
    });
  });

  it('picks tips by rule: over the goal, then many pickups', () => {
    const r = plainReport(base({ phoneMin: 300, pickups: 80, longest: { app: 'Gmail', category: 'messages', minutes: 40, start: '09:00' }, late: { after: '23:00', minutes: 0 } }));
    expect(r.highlights[2]).toEqual({ kind: 'longest', label: 'Longest stretch', value: 'Gmail · 40m' });
    expect(r.tomorrow).toEqual(['Stay under your 4h goal', 'Try 60 pickups or fewer']);
  });
});
