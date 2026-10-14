import { refreshIsland } from '../island/refresh';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { getDb } from '../db/expoDb';
import { handleCoachResponse, isCoachResponse } from '../coach/actions';
import { fromResponse, handleReminderAction, type ResponseLike } from './actions';
import { expoNotifier } from './expoNotifier';

export const RESPONSE_TASK = 'daily-notification-response';

// Android runs this for a button tap while Daily is in the background or closed ("I had some", "Done", "Snooze").
// Imported from index.ts so it is defined before anything else loads. The payload is the NotificationResponse itself.
TaskManager.defineTask(RESPONSE_TASK, async ({ data }) => {
  try {
    if (!data || typeof data !== 'object' || !('actionIdentifier' in data)) return;
    if (isCoachResponse(data as unknown as ResponseLike)) { await handleCoachResponse(getDb(), expoNotifier, data as unknown as ResponseLike, Date.now()); return; }
    const a = fromResponse(data as unknown as Parameters<typeof fromResponse>[0]);
    if (a && a.actionId !== 'open' && a.actionId !== 'break') { await handleReminderAction(getDb(), expoNotifier, a, Date.now()); await refreshIsland(); }
  } catch (e) {
    console.warn('daily: background reminder action failed', e);
  }
});

export async function registerResponseTask(): Promise<void> {
  if (!(await TaskManager.isTaskRegisteredAsync(RESPONSE_TASK))) await Notifications.registerTaskAsync(RESPONSE_TASK);
}
