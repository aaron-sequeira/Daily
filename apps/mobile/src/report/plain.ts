import { formatDuration as f } from '../format';
import { clockShort, timeRange } from './days';
import type { ReportInput } from './input';
import type { Highlight } from './store';

export type PlainReport = { headline: string; highlights: Highlight[]; tomorrow: string[] };

const NEAR_MIN = 10; // within 10 minutes of the average reads as "about average"
const FALLBACK_TIPS = ['Keep a phone-free hour in the morning', 'Take a short walk without your phone'];
const scrolly = (c: string) => c === 'social' || c === 'fun';

export function average(last7: ReportInput['last7']): number | null {
  return last7.length >= 3 ? Math.round(last7.reduce((t, d) => t + d.phoneMin, 0) / last7.length) : null;
}

function headline(i: ReportInput): string {
  if (i.phoneMin === 0) return 'A quiet day: no phone time recorded.';
  const avg = average(i.last7);
  if (avg !== null && i.phoneMin < avg - NEAR_MIN) return `A calmer day: ${f(i.phoneMin)}, ${f(avg - i.phoneMin)} under your average.`;
  if (avg !== null && i.phoneMin > avg + NEAR_MIN) return `A busier day: ${f(i.phoneMin)}, ${f(i.phoneMin - avg)} over your average.`;
  if (i.phoneMin < i.goalMin) return `${f(i.phoneMin)} on your phone, ${f(i.goalMin - i.phoneMin)} under your ${f(i.goalMin)} goal.`;
  if (i.phoneMin > i.goalMin) return `${f(i.phoneMin)} on your phone, ${f(i.phoneMin - i.goalMin)} over your ${f(i.goalMin)} goal.`;
  return `${f(i.phoneMin)} on your phone, right on your goal.`;
}

function highlights(i: ReportInput): Highlight[] {
  const out: Highlight[] = [];
  if (i.quietest) out.push({ kind: 'quiet', label: 'Quietest stretch', value: timeRange(i.quietest.from, i.quietest.to) });
  const opened = [...i.apps].sort((a, b) => b.opens - a.opens)[0];
  if (opened && opened.opens >= 2) out.push({ kind: 'opened', label: 'Most opened', value: `${opened.name} · ${opened.opens}×` });
  if (i.longest) out.push({ kind: 'longest', label: scrolly(i.longest.category) ? 'Longest scroll' : 'Longest stretch', value: `${i.longest.app} · ${f(i.longest.minutes)}` });
  out.push({ kind: 'late', label: `After ${clockShort(i.late.after)}`, value: i.late.minutes > 0 ? f(i.late.minutes) : 'None' });
  return out;
}

/** Two "Tomorrow, try" items, the first rules that apply, topped up with gentle defaults. */
function tips(i: ReportInput): string[] {
  const out: string[] = [];
  if (i.longest && i.longest.minutes >= 25 && scrolly(i.longest.category)) out.push(`Leave ${i.longest.app} after 20 minutes`);
  if (i.late.minutes >= 15) out.push(`Phone away by ${clockShort(i.late.after)}`);
  if (i.phoneMin > i.goalMin) out.push(`Stay under your ${f(i.goalMin)} goal`);
  if (i.pickups >= 60) out.push(`Try ${Math.floor((i.pickups * 0.8) / 5) * 5} pickups or fewer`);
  return [...out, ...FALLBACK_TIPS].slice(0, 2);
}

/** Spec §10.2: the free report, and the fallback whenever the AI one can't be had. */
export function plainReport(i: ReportInput): PlainReport {
  return { headline: headline(i), highlights: highlights(i), tomorrow: tips(i) };
}
