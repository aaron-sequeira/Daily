import type { Chapter } from '../replay/chapters';

const BEHAVIOUR = ['Was any of it for work?', 'What else did I do?'];
const QUESTIONS: Record<string, string[]> = {
  frequent_returns: ['Why do I keep opening it?', 'When did this start today?'],
  personal_best: ['What was I working on?', 'How does this compare to last week?'],
  doomscroll: BEHAVIOUR, scattered: BEHAVIOUR, stuck_escape: BEHAVIOUR, app_cap: BEHAVIOUR
};

/** The follow-ups a moment offers; [] for rules without any. */
export const questionsFor = (ruleId: string): string[] => QUESTIONS[ruleId] ?? [];
export const offerQuestions = (localModelReady: boolean, ruleId: string): string[] => (localModelReady ? questionsFor(ruleId) : []);

export const ASK_JSON_SCHEMA = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false };
export const parseAnswer = (v: unknown): { answer: string } | null => {
  const a = (v as { answer?: unknown } | null)?.answer;
  return typeof a === 'string' && a.trim() ? { answer: a.trim().slice(0, 400) } : null;
};

const clock = (ms: number): string => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** Today's chapters (titles, apps, minutes and times only: chapters never carry screen text) and the question. */
export function askPrompt(q: string, ctx: { nowLabel: string; chapters: Chapter[]; nudgeTitle: string }): { system: string; user: string } {
  const system = 'You are Sunny, the friendly helper in Daily, a screen-time app. Answer the question about the user\'s day from the '
    + 'timeline you are given, in one or two plain, kind sentences. Use only what the timeline shows; if it does not say, say so. '
    + 'Answer as JSON {"answer": "..."}.';
  const lines = ctx.chapters.map((c) => `${clock(c.start)}–${clock(c.end)} ${c.category}: ${c.title} (${c.apps.map((a) => `${a.app} ${a.minutes} min`).join(', ')})`);
  const user = `It is ${ctx.nowLabel}. Daily just told the user: "${ctx.nudgeTitle}".\nToday so far:\n${lines.join('\n') || '(nothing yet)'}\n\nQuestion: ${q}`;
  return { system, user };
}
