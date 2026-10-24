import type { FocusSessionRow } from '@worksight/core/types';
import { categoryForApp, displayAppName } from '../../shared/categories';
import type { Episode } from '../report/episodes';

/** Only what a chapter needs from an episode: no screen text can reach Replay or the Island's questions. */
export type ChapterEpisode = Pick<Episode, 'start' | 'end' | 'app' | 'category' | 'titles'>;
export interface Chapter {
  id: string; start: number; end: number; category: string; title: string;
  apps: { app: string; minutes: number }[]; seen: string[]; switches: number;
}

const MIN = 60_000;
const GAP_MS = 10 * MIN;
const SHORT_MS = 10 * MIN;
const TITLE_MAX = 60;
const SEEN_MAX = 8;

/** The tracker's focus sessions (recorded for everyone, screen reading or not) as chapter episodes. */
export function sessionsToEpisodes(rows: FocusSessionRow[], now: number): ChapterEpisode[] {
  return rows.map((r) => ({
    start: r.startedAt, end: r.endedAt ?? Math.max(r.startedAt, now), app: displayAppName(r.appName),
    category: categoryForApp(r.appName), titles: r.windowTitle ? [r.windowTitle] : []
  }));
}

const span = (g: ChapterEpisode[]): number => g[g.length - 1].end - g[0].start;

function toChapter(g: ChapterEpisode[], category: string): Chapter {
  const byApp = new Map<string, number>();
  for (const e of g) byApp.set(e.app, (byApp.get(e.app) ?? 0) + (e.end - e.start));
  const apps = [...byApp.entries()].sort((a, b) => b[1] - a[1]).map(([app, ms]) => ({ app, minutes: Math.round(ms / MIN) }));
  const top = apps[0].app;
  const counts = new Map<string, number>();
  for (const e of g) if (e.app === top) for (const t of e.titles) counts.set(t, (counts.get(t) ?? 0) + 1);
  const topTitle = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  let switches = 0;
  for (let i = 1; i < g.length; i++) if (g[i].app !== g[i - 1].app) switches++;
  return {
    id: `c${g[0].start}`, start: g[0].start, end: g[g.length - 1].end, category,
    title: (topTitle ? `${top} · ${topTitle}` : top).slice(0, TITLE_MAX),
    apps, seen: [...new Set(g.flatMap((e) => e.titles))].slice(0, SEEN_MAX), switches
  };
}

/** The day as chapters: same-category runs (gaps under 10 min), with anything under 10 min folded into its longer
 * neighbour so the ribbon stays readable. */
export function buildChapters(episodes: ChapterEpisode[]): Chapter[] {
  const groups: { cat: string; eps: ChapterEpisode[] }[] = [];
  for (const e of [...episodes].sort((a, b) => a.start - b.start)) {
    const g = groups[groups.length - 1];
    if (g && g.cat === e.category && e.start - g.eps[g.eps.length - 1].end < GAP_MS) g.eps.push(e);
    else groups.push({ cat: e.category, eps: [e] });
  }
  // ponytail: O(n²) over a day's chapters (tens at most); fine.
  while (groups.length > 1) {
    let i = -1;
    for (let k = 0; k < groups.length; k++) if (span(groups[k].eps) < SHORT_MS && (i < 0 || span(groups[k].eps) < span(groups[i].eps))) i = k;
    if (i < 0) break;
    const prev = groups[i - 1], next = groups[i + 1];
    const into = !next || (prev && span(prev.eps) >= span(next.eps)) ? i - 1 : i + 1;
    const merged = into < i ? [...groups[into].eps, ...groups[i].eps] : [...groups[i].eps, ...groups[into].eps];
    groups[into] = { cat: groups[into].cat, eps: merged };
    groups.splice(i, 1);
  }
  return groups.map((g) => toChapter(g.eps, g.cat));
}
