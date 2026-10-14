import { refreshIsland } from '../island/refresh';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { handleCoachResponse, isCoachResponse } from '../coach/actions';
import { getDb } from '../db/expoDb';
import { reportTap } from '../report/tap';
import { fromResponse, handleReminderAction } from './actions';
import { applyReminders } from './apply';
import { routeTap } from './routeTap';
import { expoNotifier } from './expoNotifier';

/** Taps that reach the running app (and the one that cold-started it). handleReminderAction remembers the last
 * response, so a re-render or an app restart never handles the same tap twice. */
export function useReminderResponses(): void {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    const reportDay = reportTap(getDb(), response);
    // `tap` is new every time, so the Report tab reloads even when it already shows this day.
    if (reportDay) { router.push({ pathname: '/report', params: { day: reportDay, tap: String(Date.now()) } }); return; }
    const route = routeTap(getDb(), response);
    if (route) { router.push(route); return; }
    if (isCoachResponse(response)) {
      handleCoachResponse(getDb(), expoNotifier, response, Date.now()).catch((e) => console.warn('daily: coach action failed', e));
      return;
    }
    const a = fromResponse(response);
    if (!a) return;
    handleReminderAction(getDb(), expoNotifier, a, Date.now())
      .then((open) => {
        if (open?.route === '/break') router.push({ pathname: '/break', params: { id: String(open.reminderId) } });
        else if (open?.route === '/reminders') router.push('/reminders');
        void refreshIsland();
        return applyReminders();
      })
      .catch((e) => console.warn('daily: reminder action failed', e));
  }, [response]);
}
