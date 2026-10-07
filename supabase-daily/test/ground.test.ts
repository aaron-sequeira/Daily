import { describe, expect, it } from 'vitest';
import type { ReportInput, WeekInput } from '../supabase/functions/daily-ai/contract.ts';
import { checkReport, checkWeek, ungrounded } from '../supabase/functions/daily-ai/ground.ts';
import sample from './sample-request.json';

const input = sample.input as unknown as ReportInput;
const week: WeekInput = { weekStart: '2026-10-05', avgMin: 40, lastAvgMin: 90, days: [{ day: '2026-10-05', phoneMin: 60 }, { day: '2026-10-06', phoneMin: 30 }], topApps: [{ name: 'Instagram', minutes: 30 }] };
const good = { headline: 'A calm day: 1h 32m on your phone.', story: 'Instagram took 42 minutes at lunch. The evening stayed quiet.', tomorrow: ['Leave Instagram after 20 minutes', 'Phone away by 11 pm'] };

describe('grounding (spec §10.3)', () => {
  it('spots durations that are not in the data', () => {
    const allowed = [92, 42];
    expect(ungrounded('You spent 1h 32m today', allowed)).toBe(false);
    expect(ungrounded('Instagram took 42 minutes', allowed)).toBe(false);
    expect(ungrounded('a 41m stretch', allowed)).toBe(false); // ±1 for rounding
    expect(ungrounded('about 2 hours on YouTube', allowed)).toBe(true);
    expect(ungrounded('3M views and a walk at 9 am', allowed)).toBe(false);
  });

  it('keeps a grounded report, trimmed', () => {
    expect(checkReport({ ...good, headline: `  ${good.headline} ` }, input)).toEqual(good);
  });

  it('drops a story sentence with an invented number, but fails a bad headline or tip', () => {
    expect(checkReport({ ...good, story: 'Instagram took 42 minutes at lunch. You scrolled for 3 hours at night.' }, input))
      .toEqual({ ...good, story: 'Instagram took 42 minutes at lunch.' });
    expect(checkReport({ ...good, story: 'You scrolled for 3 hours at night.' }, input)).toBeNull();
    expect(checkReport({ ...good, headline: 'You spent 5 hours on your phone.' }, input)).toBeNull();
    expect(checkReport({ ...good, tomorrow: ['Cut Instagram to 37 minutes', 'Phone away by 11 pm'] }, input)).toBeNull();
  });

  it('refuses the wrong shape or length', () => {
    expect(checkReport({ ...good, tomorrow: ['One'] }, input)).toBeNull();
    expect(checkReport({ ...good, tomorrow: [...good.tomorrow, 'Three'] }, input)).toBeNull();
    expect(checkReport({ ...good, tomorrow: ['x'.repeat(81), 'Phone away by 11 pm'] }, input)).toBeNull();
    expect(checkReport({ ...good, headline: 'x'.repeat(121) }, input)).toBeNull();
    expect(checkReport({ ...good, story: '' }, input)).toBeNull();
    expect(checkReport(null, input)).toBeNull();
  });

  it('checks the week sentence the same way', () => {
    expect(checkWeek({ sentence: 'You averaged 40m a day, 50m less than last week.' }, week)).toEqual({ sentence: 'You averaged 40m a day, 50m less than last week.' });
    expect(checkWeek({ sentence: 'You averaged 2 hours a day.' }, week)).toBeNull();
    expect(checkWeek({ sentence: 'x'.repeat(201) }, week)).toBeNull();
  });
});
