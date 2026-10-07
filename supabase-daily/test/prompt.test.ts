import { describe, expect, it } from 'vitest';
import { parseRequest } from '../supabase/functions/daily-ai/contract.ts';
import { buildPrompt, REPORT_SCHEMA } from '../supabase/functions/daily-ai/prompt.ts';
import sample from './sample-request.json';

const week = { kind: 'week', input: { weekStart: '2026-09-28', avgMin: 40, lastAvgMin: 90, days: [{ day: '2026-09-28', phoneMin: 60 }], topApps: [{ name: 'Instagram', minutes: 30 }] } };

describe('buildPrompt', () => {
  it('sends the rules, the validated data and its durations, nothing else', () => {
    const p = buildPrompt(parseRequest(sample)!);
    expect(p.schemaName).toBe('daily_report');
    expect(p.schema).toBe(REPORT_SCHEMA);
    expect(p.messages[0]).toMatchObject({ role: 'system' });
    expect(p.messages[0].content).toContain('headline');
    expect(p.messages[0].content).toContain("as 'Xh Ym'");
    const [, data, durations, ...rest] = p.messages[1].content.split('\n');
    expect(JSON.parse(data)).toEqual(sample.input);
    expect(rest).toEqual([]);
    // last7 has only 2 days, so no average; late is 15 minutes
    expect(durations).toBe('Durations: phone time 1h 32m; goal 4h; 2h 28m under the goal; longest 42 minutes; quietest 10h 18m; late 15 minutes');
  });

  it('adds the recent average once last7 has 3 days', () => {
    const r = JSON.parse(JSON.stringify(sample));
    r.input.last7.push({ day: '2026-10-04', phoneMin: 120 }); // (30 + 60 + 120) / 3 = 70
    const durations = buildPrompt(parseRequest(r)!).messages[1].content.split('\n')[2];
    expect(durations).toContain('last7 average 1h 10m; 22 minutes over it');
  });

  it('describes a week that has ended, with its durations', () => {
    const p = buildPrompt(parseRequest(week)!);
    expect(p.schemaName).toBe('week_sentence');
    expect(p.messages[0].content).toContain('"that week"');
    expect(p.messages[0].content.replace('never "this week"', '')).not.toMatch(/this week/i);
    const [, data, durations] = p.messages[1].content.split('\n');
    expect(JSON.parse(data)).toEqual(week.input);
    expect(durations).toBe('Durations: average 40 minutes a day; the week before 1h 30m a day; 50 minutes a day less than the week before');
  });
});
