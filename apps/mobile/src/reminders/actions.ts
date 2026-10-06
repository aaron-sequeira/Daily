import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import { reminderContent, type Notifier } from './notifier';
import { getReminder, logWater, markDone } from './store';

/** expo-notifications' id for a tap on the notification body (kept here so this file never imports expo). */
export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';
export const SNOOZE_MS = 15 * 60_000;

export type ReminderAction = { actionId: string; reminderId: number; notificationKey: string; firedAtMs: number };
export type OpenTarget = { route: '/break'; reminderId: number } | { route: '/reminders' } | null;

type ResponseLike = { actionIdentifier: string; notification: { date: number; request: { identifier: string; content: { data?: Record<string, unknown> | null } } } };

export function fromResponse(r: ResponseLike): ReminderAction | null {
  const reminderId = Number(r.notification.request.content.data?.reminderId);
  if (!Number.isInteger(reminderId)) return null;
  return {
    actionId: r.actionIdentifier === DEFAULT_ACTION ? 'open' : r.actionIdentifier,
    reminderId,
    notificationKey: r.notification.request.identifier,
    firedAtMs: r.notification.date
  };
}

/** One handler for both the in-app listener and the background action task. The same response can reach both (and
 * the last response survives an app restart), so it is handled once, remembered in settings. */
export async function handleReminderAction(db: Db, notifier: Notifier, a: ReminderAction, nowMs: number): Promise<OpenTarget> {
  const tag = `${a.notificationKey}|${a.actionId}|${a.firedAtMs}`;
  if (getSetting(db, 'last_response') === tag) return null;
  setSetting(db, 'last_response', tag);
  const r = getReminder(db, a.reminderId);
  if (!r) return null;
  if (a.actionId !== 'open') await notifier.dismiss(a.notificationKey);
  switch (a.actionId) {
    case 'water': logWater(db, nowMs); markDone(db, r.id, nowMs); return null;
    case 'done': markDone(db, r.id, nowMs); return null;
    case 'snooze': await notifier.scheduleAt(`snooze-${r.id}`, reminderContent(r), nowMs + SNOOZE_MS); return null;
    case 'break': return { route: '/break', reminderId: r.id };
    default: return r.breakSec > 0 ? { route: '/break', reminderId: r.id } : { route: '/reminders' };
  }
}
