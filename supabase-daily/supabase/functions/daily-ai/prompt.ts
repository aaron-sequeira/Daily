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
  'If yesterdayPlan has items, you may say kindly how they went.',
  "Write any duration of 60 minutes or more as 'Xh Ym' (for example 3h 39m); under 60 as 'N minutes'. The Durations line has them ready.",
  'Only compare with recent days when last7 has 3 or more days.',
  'Never mention data that is missing, empty or zero.'
].join('\n');

const WEEK_RULES = [
  "You write one sentence about someone's week of phone use, for the app Daily.",
  'Write to them as "you". Warm and plain, no judgement, no emojis.',
  'Use only numbers that appear in the data (whole minutes; write them like "1h 32m"). The Durations line has them ready.',
  'The week being described has ended: call it "that week" or "the week", never "this week".',
  'lastAvgMin is the daily average of the week before; call it "the week before". Compare with it only when it is given.',
  'sentence: at most 200 characters.'
].join('\n');

/** Minutes the way the rules ask for them: "3h 39m", "4h", "42 minutes". */
const fmt = (min: number): string => {
  if (min < 60) return `${min} minutes`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h}h ${min % 60}m` : `${h}h`;
};
const gap = (a: number, b: number, more: string, less: string) => `${fmt(Math.abs(a - b))}${a >= b ? more : less}`;

/** Every duration the model may want, computed here so it never has to do the sum (and get it wrong). */
function durations(r: AiRequest): string {
  const parts: string[] = [];
  if (r.kind === 'report') {
    const i = r.input;
    parts.push(`phone time ${fmt(i.phoneMin)}`, `goal ${fmt(i.goalMin)}`, gap(i.phoneMin, i.goalMin, ' over the goal', ' under the goal'));
    if (i.last7.length >= 3) {
      const avg = Math.round(i.last7.reduce((t, d) => t + d.phoneMin, 0) / i.last7.length);
      parts.push(`last7 average ${fmt(avg)}`, gap(i.phoneMin, avg, ' over it', ' under it'));
    }
    if (i.longest) parts.push(`longest ${fmt(i.longest.minutes)}`);
    if (i.quietest) parts.push(`quietest ${fmt(i.quietest.minutes)}`);
    if (i.late.minutes > 0) parts.push(`late ${fmt(i.late.minutes)}`);
  } else {
    const i = r.input;
    parts.push(`average ${fmt(i.avgMin)} a day`);
    if (i.lastAvgMin !== null) parts.push(`the week before ${fmt(i.lastAvgMin)} a day`, gap(i.avgMin, i.lastAvgMin, ' a day more than the week before', ' a day less than the week before'));
  }
  return `Durations: ${parts.join('; ')}`;
}

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

/** The rules, plus the already-validated input as JSON and its durations: the only things from the caller that reach the model. */
export function buildPrompt(r: AiRequest): { messages: Msg[]; schemaName: string; schema: Record<string, unknown> } {
  return r.kind === 'report'
    ? { messages: [{ role: 'system', content: REPORT_RULES }, { role: 'user', content: `The day's data:\n${JSON.stringify(r.input)}\n${durations(r)}` }], schemaName: 'daily_report', schema: REPORT_SCHEMA }
    : { messages: [{ role: 'system', content: WEEK_RULES }, { role: 'user', content: `The week's data:\n${JSON.stringify(r.input)}\n${durations(r)}` }], schemaName: 'week_sentence', schema: WEEK_SCHEMA };
}
