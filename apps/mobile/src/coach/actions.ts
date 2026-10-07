import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import type { ResponseLike } from '../reminders/actions';
import type { Notifier } from '../reminders/notifier';

export const COACH_SNOOZE_MS = 60 * 60_000;

export function isCoachResponse(r: ResponseLike): boolean {
  return r.notification.request.content.data?.coach === true;
}

/** "Snooze 1 h" silences every nudge for an hour. A tap on the body just opens Daily. */
export async function handleCoachResponse(db: Db, notifier: Notifier, r: ResponseLike, nowMs: number): Promise<void> {
  if (r.actionIdentifier !== 'coach-snooze') return;
  // useLastNotificationResponse() replays the last tap on every launch: handle each response once.
  const tag = `${r.notification.request.identifier}|${r.actionIdentifier}|${r.notification.date}`;
  if (getSetting(db, 'coach_last_response') === tag) return;
  setSetting(db, 'coach_snooze_until', nowMs + COACH_SNOOZE_MS);
  await notifier.dismiss(r.notification.request.identifier);
  setSetting(db, 'coach_last_response', tag); // after the effects: a failed dismiss can be retried
}
