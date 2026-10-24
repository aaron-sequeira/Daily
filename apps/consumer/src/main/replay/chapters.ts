import { displayAppName } from '../../shared/categories';
import type { Episode } from '../report/episodes';
import type { Piece } from '../day/today';
import { PRIVATE_TITLE, isExcluded } from '../screen/exclusions';

/** Only what a chapter needs from an episode: no screen text can reach Replay or the Island's questions. */
export type ChapterEpisode = Pick<Episode, 'start' | 'end' | 'app' | 'category' | 'titles'>;
export interface Chapter {
  id: string; start: number; end: number; category: string; title: string;
  apps: { app: string; minutes: number }[]; seen: string[]; switches: number;
  /** On screen inside the chapter (gaps and away time not counted). */
  ms: number;
}

const MIN = 60_000;
const GAP_MS = 10 * MIN;
const SHORT_MS = 10 * MIN;
const TITLE_MAX = 60;
const SEEN_MAX = 8;

/** The day's on-screen pieces (Today's rules: away time, lock screen and crash leftovers already dropped) as chapter
 * episodes. Private and excluded windows keep their time but lose their title. */
export function piecesToEpisodes(pieces: Piece[], exclusions: string[]): ChapterEpisode[] {
  return pieces.map((p) => {
    const t = p.title?.trim() || null;
    const shown = t && !PRIVATE_TITLE.test(t) && !isExcluded(exclusions, p.appName, t);
    return { start: p.start, end: p.end, app: displayAppName(p.appName), category: p.category, titles: shown ? [t] : [] };
  });
}

const span = (g: ChapterEpisode[]): number => g[g.length - 1].end - g[0].start;

function toChapter(g: ChapterEpisode[], category: string): Chapter {
  const byApp = new Map<string, number>();
  for (const e of g) byApp.set(e.app, (byApp.get(e.app) ?? 0) + (e.end - e.start));
  const apps = [...byApp.entries()].sort((a, b) => b[1] - a[1]).map(([app, ms]) => ({ app, minutes: Math.round(ms / MIN) }));
  const top = apps[0].app;
  const counts = new Map<string, number>();
  for (const e of g) if (e.app === top) for (const t of e.titles) counts.set(t, (counts.get(t) ?? 0) + 1);
  // Windows titles often end with " - <App>": the chapter title already leads with the app.
  const esc = top.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const topTitle = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    ?.replace(new RegExp(`(^|\\s[-–—|]\\s)${esc}$`, 'i'), '').trim() || undefined;
  let switches = 0;
  for (let i = 1; i < g.length; i++) if (g[i].app !== g[i - 1].app) switches++;
  return {
    id: `c${g[0].start}`, start: g[0].start, end: g[g.length - 1].end, category,
    title: (topTitle ? `${top} · ${topTitle}` : top).slice(0, TITLE_MAX),
    apps, seen: [...new Set(g.flatMap((e) => e.titles))].slice(0, SEEN_MAX), switches,
    ms: g.reduce((a, e) => a + (e.end - e.start), 0)
  };
}

/** The day as chapters: same-category runs (gaps under 10 min), with anything under 10 min folded into its longer
 * neighbour (one less than 10 min away) so the ribbon stays readable. */
export function buildChapters(episodes: ChapterEpisode[]): Chapter[] {
  const groups: { cat: string; eps: ChapterEpisode[] }[] = [];
  for (const e of [...episodes].sort((a, b) => a.start - b.start)) {
    const g = groups[groups.length - 1];
    if (g && g.cat === e.category && e.start - g.eps[g.eps.length - 1].end < GAP_MS) g.eps.push(e);
    else groups.push({ cat: e.category, eps: [e] });
  }
  // ponytail: O(n²) over a day's chapters (tens at most); fine.
  const near = (a: ChapterEpisode[] | undefined, b: ChapterEpisode[] | undefined): boolean =>
    !!a && !!b && b[0].start - a[a.length - 1].end < GAP_MS;
  while (groups.length > 1) {
    let i = -1;
    for (let k = 0; k < groups.length; k++) {
      const g = groups[k].eps;
      if (span(g) >= SHORT_MS || !(near(groups[k - 1]?.eps, g) || near(g, groups[k + 1]?.eps))) continue;
      if (i < 0 || span(g) < span(groups[i].eps)) i = k;
    }
    if (i < 0) break;
    const prev = near(groups[i - 1]?.eps, groups[i].eps) ? groups[i - 1] : undefined;
    const next = near(groups[i].eps, groups[i + 1]?.eps) ? groups[i + 1] : undefined;
    const into = !next || (prev && span(prev.eps) >= span(next.eps)) ? i - 1 : i + 1;
    const merged = into < i ? [...groups[into].eps, ...groups[i].eps] : [...groups[i].eps, ...groups[into].eps];
    groups[into] = { cat: groups[into].cat, eps: merged };
    groups.splice(i, 1);
    // The fold can leave two same-category chapters side by side: join them.
    for (let k = groups.length - 1; k > 0; k--) {
      const a = groups[k - 1], b = groups[k];
      if (a.cat === b.cat && b.eps[0].start - a.eps[a.eps.length - 1].end < GAP_MS) groups.splice(k - 1, 2, { cat: a.cat, eps: [...a.eps, ...b.eps] });
    }
  }
  return groups.map((g) => toChapter(g.eps, g.cat));
}
