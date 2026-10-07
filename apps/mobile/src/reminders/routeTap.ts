import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import type { ResponseLike } from './actions';

/** Notification routes the app opens on a tap (the trial reminder). Anything else in `data.route` is ignored. */
const ROUTES = ['/settings/plus'];

/** The route a tap should open, or null. useLastNotificationResponse replays the last tap on every launch, so each
 * tap is handled once (same pattern as reportTap). */
export function routeTap(db: Db, r: ResponseLike): string | null {
  const route = r.notification.request.content.data?.route;
  if (typeof route !== 'string' || !ROUTES.includes(route)) return null;
  const tag = `${r.notification.request.identifier}|${r.notification.date}`;
  if (getSetting(db, 'last_route_tap') === tag) return null;
  setSetting(db, 'last_route_tap', tag);
  return route;
}
