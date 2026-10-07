import { describe, expect, it } from 'vitest';
import { parseRequest } from '../supabase/functions/daily-ai/contract.ts';
import { buildPrompt, REPORT_SCHEMA } from '../supabase/functions/daily-ai/prompt.ts';
import sample from './sample-request.json';

describe('buildPrompt', () => {
  it('sends the rules and the validated data, nothing else', () => {
    const p = buildPrompt(parseRequest(sample)!);
    expect(p.schemaName).toBe('daily_report');
    expect(p.schema).toBe(REPORT_SCHEMA);
    expect(p.messages[0]).toMatchObject({ role: 'system' });
    expect(p.messages[0].content).toContain('headline');
    const data = p.messages[1].content.slice(p.messages[1].content.indexOf('\n') + 1);
    expect(JSON.parse(data)).toEqual(sample.input);
  });
});
