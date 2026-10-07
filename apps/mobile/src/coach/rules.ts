import { localDate } from '@worksight/core/date';
import { formatDuration } from '../format';
import type { Category } from '../tracking/categories';

export type NudgeKind = 'stretch' | 'goal80' | 'goal100' | 'winddown';
export type Nudge = { kind: NudgeKind; key: string; title: string; body: string };
export type OpenApp = { pkg: string; label: string; category: Category; androidCategory: number | null; startMs: number };
export type CoachInput = {
  nowMs: number; open: OpenApp | null; phoneMin: number; goalMin: number; windDown: string;
  lastNudgeMs: number | null; snoozeUntilMs: number; sentKeys: ReadonlySet<string>;
};

export const STRETCH_MIN = 30;
export const GAP_MS = 20 * 60_000;
const WIND_DOWN_END_MIN = 5 * 60; // the "night" ends at 05:00

// Calls, navigation and music: never interrupt them. ponytail: a short list plus Android's MAPS (6) / AUDIO (1) categories.
const QUIET_PKGS = new Set([
  'com.google.android.dialer', 'com.android.dialer', 'com.samsung.android.dialer', 'com.android.incallui', 'com.samsung.android.incallui',
  'com.google.android.apps.maps', 'com.waze', 'com.spotify.music', 'com.google.android.apps.youtube.music'
]);

export function isQuiet(open: OpenApp): boolean {
  return QUIET_PKGS.has(open.pkg) || open.androidCategory === 6 || open.androidCategory === 1;
}

const minutesOfDay = (ms: number): number => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

export function inWindDown(nowMs: number, windDown: string): boolean {
  const [h, m] = windDown.split(':').map(Number);
  const start = h * 60 + m;
  const now = minutesOfDay(nowMs);
  return start >= WIND_DOWN_END_MIN ? now >= start || now < WIND_DOWN_END_MIN : now >= start && now < WIND_DOWN_END_MIN;
}

/** The evening a late-night moment belongs to: 00:40 on Wednesday is still Tuesday's night. */
const nightOf = (nowMs: number): string => localDate(nowMs - WIND_DOWN_END_MIN * 60_000);

/** At most one nudge, only while the phone is in use, respecting snooze, the 20-minute gap and quiet apps. */
export function planNudge(i: CoachInput): Nudge | null {
  if (!i.open || isQuiet(i.open)) return null;
  if (i.nowMs < i.snoozeUntilMs) return null;
  if (i.lastNudgeMs !== null && i.nowMs - i.lastNudgeMs < GAP_MS) return null;

  const day = localDate(i.nowMs);
  const candidates: Nudge[] = [];
  if (inWindDown(i.nowMs, i.windDown)) {
    candidates.push({ kind: 'winddown', key: `winddown-${nightOf(i.nowMs)}`, title: 'Time to wind down', body: `Sunny's getting sleepy. Put the phone down soon?` });
  }
  const ratio = i.phoneMin / Math.max(i.goalMin, 1);
  if (ratio >= 1) {
    candidates.push({ kind: 'goal100', key: `goal100-${day}`, title: `You've reached your goal`, body: `That's ${formatDuration(i.goalMin)} on your phone today.` });
  } else if (ratio >= 0.8) {
    candidates.push({ kind: 'goal80', key: `goal80-${day}`, title: `${formatDuration(i.goalMin - i.phoneMin)} left`, body: `You're close to your phone goal for today.` });
  }
  const stretchMin = Math.floor((i.nowMs - i.open.startMs) / 60_000);
  if ((i.open.category === 'social' || i.open.category === 'fun') && stretchMin >= STRETCH_MIN) {
    candidates.push({ kind: 'stretch', key: `stretch-${i.open.pkg}-${i.open.startMs}`, title: `${stretchMin} minutes on ${i.open.label}`, body: `That's a long stretch. A good spot to stop?` });
  }
  return candidates.find((c) => !i.sentKeys.has(c.key)) ?? null;
}
