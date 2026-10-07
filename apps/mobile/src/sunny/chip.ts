import { formatDuration } from '../format';
import { goalLine } from '../today/copy';
import { MOOD_COPY, type Mood } from './mood';

export type ChipContent = { title: string; short: string; text: string; mood: Mood | 'unknown' };

export function chipContent(v: { access: boolean; phoneMin: number; goalMin: number; leftMin: number; mood: Mood }): ChipContent {
  if (!v.access) return { title: 'Daily', short: 'Daily', text: 'Turn on usage access so Sunny can see your day', mood: 'unknown' };
  const time = formatDuration(v.phoneMin);
  return { title: `${time} today`, short: time, text: `${MOOD_COPY[v.mood].title} · ${goalLine(v.leftMin, v.goalMin)}`, mood: v.mood };
}
