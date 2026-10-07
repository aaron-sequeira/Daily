import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runReportWriter } from '../report/run';
import { runSync } from './runSync';

export const SYNC_TASK = 'daily-sync';

// Must run at module load (imported from index.ts) so Android can wake the task with the app closed.
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    await runSync();
    await runReportWriter({ retryFailed: false });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('daily: background sync failed', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerSyncTask(): Promise<void> {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) return;
  await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 });
}
