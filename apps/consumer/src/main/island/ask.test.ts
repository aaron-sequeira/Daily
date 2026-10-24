import { describe, it, expect } from 'vitest';
import { askPrompt, offerQuestions, questionsFor } from './ask';
import { buildChapters } from '../replay/chapters';
import type { Episode } from '../report/episodes';

const M = 60_000;
const T0 = new Date(2026, 9, 22, 9, 0).getTime();
const ep = (s: number, e: number, app: string, category: string, title: string): Episode => ({
  id: `e${s}`, start: T0 + s * M, end: T0 + e * M, app, category, activity: null, titles: [title],
  samples: ['SECRET screen text from the page'], avgStuck: 0, avgDistraction: 0, stuckReads: 0, reads: 1
});

describe('island questions', () => {
  it('offers questions only when a local model can answer', () => {
    expect(offerQuestions(false, 'personal_best')).toEqual([]);
    expect(offerQuestions(true, 'personal_best')).toEqual(questionsFor('personal_best'));
  });

  it('questionsFor knows each moment', () => {
    expect(questionsFor('frequent_returns')).toEqual(['Why do I keep opening it?', 'When did this start today?']);
    expect(questionsFor('personal_best')).toEqual(['What was I working on?', 'How does this compare to last week?']);
    for (const r of ['doomscroll', 'scattered', 'stuck_escape', 'app_cap']) expect(questionsFor(r)).toEqual(['Was any of it for work?', 'What else did I do?']);
    for (const r of ['eye_break', 'deep_work', 'day_ready', 'nope']) expect(questionsFor(r)).toEqual([]);
    for (const r of ['frequent_returns', 'personal_best', 'doomscroll']) expect(questionsFor(r).length).toBeLessThanOrEqual(3);
  });

  it('askPrompt includes chapter titles and times, never screen samples', () => {
    const chapters = buildChapters([ep(0, 50, 'Code', 'work', 'app.ts - proj'), ep(50, 80, 'Discord', 'social', '#general')]);
    const { system, user } = askPrompt('What was I working on?', { nowLabel: '10:30', chapters, nudgeTitle: 'Your longest focus stretch this month' });
    expect(user).toContain('What was I working on?');
    expect(user).toContain('Your longest focus stretch this month');
    expect(user).toContain('Code · app.ts - proj');
    expect(user).toContain('09:00');
    expect(user).toContain('Code 50 min');
    expect(user).toContain('10:30');
    expect(system + user).not.toContain('SECRET');
    expect(system).toMatch(/one or two/i);
  });
});
