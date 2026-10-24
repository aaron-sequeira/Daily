import type { Chapter } from '../replay/chapters';

const BEHAVIOUR = ['Was any of it for work?', 'What else did I do?'];
const QUESTIONS: Record<string, string[]> = {
  // Only what today's timeline can answer (the model sees nothing older).
  frequent_returns: ['Why do I keep opening it?', 'What was I doing in between?'],
  personal_best: ['What was I working on?', 'What did I do before it?'],
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

export const SORRY = "I couldn't work that out just now.";

/** Answers a tapped question for card `id`. Every call gets an answer (the card would otherwise sit on "Thinking…"):
 * a question the card didn't offer, a second one while the model is busy, or a model failure all get SORRY. */
export function createAsker(d: {
  ruleOf(id: number): string | undefined; titleOf(id: number): string;
  context(): { nowLabel: string; chapters: Chapter[] };
  model(system: string, user: string): Promise<string | null>;
  answer(id: number, text: string): void;
}): (id: number, q: string) => Promise<void> {
  let busy = false;
  return async (id, q) => {
    const rule = d.ruleOf(id);
    if (busy || !rule || !questionsFor(rule).includes(q)) { d.answer(id, SORRY); return; }
    busy = true;
    try {
      const { system, user } = askPrompt(q, { ...d.context(), nudgeTitle: d.titleOf(id) });
      d.answer(id, (await d.model(system, user).catch(() => null)) ?? SORRY);
    } finally {
      busy = false;
    }
  };
}
