import type { AiRequest } from './contract.ts';

export type Msg = { role: 'system' | 'user'; content: string };

const REPORT_RULES = [
  'You write a short end-of-day note about how someone used their phone on one day, for the app Daily.',
  'Write to them as "you". Warm, plain and kind: no judgement, no lecturing, no emojis, no exclamation marks.',
  'Use only numbers that appear in the data. Durations are whole minutes; write them like "1h 32m" or "42 minutes". Times are 24-hour local; write them like "9:10 am".',
  'Never guess why they used an app or what they did in it.',
  'headline: one sentence, at most 120 characters.',
  'story: 2 to 4 sentences, at most 600 characters, about the shape of the day: the busy and quiet parts, the longest stretch, and how it compares with their goal and recent days (last7).',
  'tomorrow: exactly two small, concrete things to try tomorrow, each at most 80 characters.',
  'If yesterdayPlan has items, you may say kindly how they went.'
].join('\n');

const WEEK_RULES = [
  "You write one sentence about someone's week of phone use, for the app Daily.",
  'Write to them as "you". Warm and plain, no judgement, no emojis.',
  'Use only numbers that appear in the data (whole minutes; write them like "1h 32m"). Compare with last week when lastAvgMin is given.',
  'sentence: at most 200 characters.'
].join('\n');

export const REPORT_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['headline', 'story', 'tomorrow'],
  properties: {
    headline: { type: 'string', maxLength: 120 },
    story: { type: 'string', maxLength: 600 },
    tomorrow: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string', maxLength: 80 } }
  }
};

export const WEEK_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['sentence'],
  properties: { sentence: { type: 'string', maxLength: 200 } }
};

/** The rules, plus the already-validated input as JSON: the only thing from the caller that reaches the model. */
export function buildPrompt(r: AiRequest): { messages: Msg[]; schemaName: string; schema: Record<string, unknown> } {
  return r.kind === 'report'
    ? { messages: [{ role: 'system', content: REPORT_RULES }, { role: 'user', content: `The day's data:\n${JSON.stringify(r.input)}` }], schemaName: 'daily_report', schema: REPORT_SCHEMA }
    : { messages: [{ role: 'system', content: WEEK_RULES }, { role: 'user', content: `The week's data:\n${JSON.stringify(r.input)}` }], schemaName: 'week_sentence', schema: WEEK_SCHEMA };
}
