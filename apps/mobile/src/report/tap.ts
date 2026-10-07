import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import type { ResponseLike } from '../reminders/actions';

/** The day a "Your day is ready" tap should open, or null. useLastNotificationResponse replays the last tap on every
 * launch, so each tap is handled once (same pattern as the coach's snooze). */
export function reportTap(db: Db, r: ResponseLike): string | null {
  const day = r.notification.request.content.data?.report;
  if (typeof day !== 'string') return null;
  const tag = `${r.notification.request.identifier}|${r.notification.date}`;
  if (getSetting(db, 'last_report_tap') === tag) return null;
  setSetting(db, 'last_report_tap', tag);
  return day;
}
