import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { getNumber, getSetting } from '../db/settings';
import type { Notifier } from '../reminders/notifier';
import { isCategory } from '../tracking/categories';
import { loadState, phoneMsForDay } from '../tracking/sync';
import { planNudge, type NudgeKind, type OpenApp } from './rules';

const DAY_MS = 86_400_000;

function openApp(db: Db): OpenApp | null {
  const s = loadState(db);
  if (s.openPkg === null || s.openStartMs === null) return null;
  const a = db.get<{ label: string; category: string; user_category: string | null; android_category: number | null }>(
    'SELECT label, category, user_category, android_category FROM apps WHERE package = ?', [s.openPkg]);
  const category = isCategory(a?.user_category) ? a!.user_category : isCategory(a?.category) ? a!.category : 'other';
  return { pkg: s.openPkg, label: a?.label ?? s.openPkg, category, androidCategory: a?.android_category ?? null, startMs: s.openStartMs };
}

/** Runs after each sync from the Sunny service's minute task: picks at most one nudge, shows it, remembers its key. */
export async function coachTick(db: Db, notifier: Notifier, nowMs: number, inCall = false, speak?: (title: string, body: string) => void): Promise<NudgeKind | null> {
  if (getSetting(db, 'onboarded') !== '1') return null;
  const nudge = planNudge({
    nowMs,
    inCall,
    open: openApp(db),
    phoneMin: phoneMsForDay(db, localDate(nowMs), nowMs) / 60_000,
    goalMin: getNumber(db, 'goal_min'),
    windDown: getSetting(db, 'wind_down'),
    lastNudgeMs: db.get<{ t: number | null }>('SELECT MAX(ts_ms) AS t FROM nudges')?.t ?? null,
    snoozeUntilMs: getNumber(db, 'coach_snooze_until'),
    sentKeys: new Set(db.all<{ key: string }>('SELECT key FROM nudges WHERE ts_ms > ?', [nowMs - 2 * DAY_MS]).map((r) => r.key))
  });
  if (!nudge) return null;
  let spoken = false;
  if (speak) {
    try { speak(nudge.title, nudge.body); spoken = true; } catch (e) { console.warn('daily: bubble speech failed, using a notification', e); }
  }
  if (!spoken) {
    if (!(await notifier.canNotify().catch(() => false))) return null;
    await notifier.showCoach(`coach-${nudge.kind}`, nudge.title, nudge.body);
  }
  db.run('INSERT OR IGNORE INTO nudges (kind, key, ts_ms) VALUES (?, ?, ?)', [nudge.kind, nudge.key, nowMs]);
  return nudge.kind;
}
