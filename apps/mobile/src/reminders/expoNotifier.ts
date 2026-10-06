import * as Notifications from 'expo-notifications';
import type { Notifier, ReminderContent } from './notifier';

export const REMINDER_CHANNEL = 'reminders';

/** Foreground display, the Android channel and the three button sets. Safe to call more than once. */
export async function setupNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
  });
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.HIGH });
  const snooze = { identifier: 'snooze', buttonTitle: 'Snooze 15 min', options: { opensAppToForeground: false } };
  const brk = { identifier: 'break', buttonTitle: 'Take a break', options: { opensAppToForeground: true } };
  await Notifications.setNotificationCategoryAsync('water', [
    { identifier: 'water', buttonTitle: 'I had some', options: { opensAppToForeground: false } }, brk, snooze
  ]);
  await Notifications.setNotificationCategoryAsync('break', [brk, snooze]);
  await Notifications.setNotificationCategoryAsync('nudge', [
    { identifier: 'done', buttonTitle: 'Done', options: { opensAppToForeground: false } }, snooze
  ]);
}

const content = (c: ReminderContent): Notifications.NotificationContentInput => ({
  title: c.title, body: c.body, categoryIdentifier: c.category, data: { reminderId: c.reminderId }
});

export const expoNotifier: Notifier = {
  async scheduleAt(key, c, atMs) {
    await Notifications.scheduleNotificationAsync({
      identifier: key, content: content(c),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: atMs, channelId: REMINDER_CHANNEL }
    });
  },
  async showNow(key, c) {
    await Notifications.scheduleNotificationAsync({ identifier: key, content: content(c), trigger: { channelId: REMINDER_CHANNEL } });
  },
  cancel: (key) => Notifications.cancelScheduledNotificationAsync(key),
  scheduledKeys: async () => (await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier),
  dismiss: (key) => Notifications.dismissNotificationAsync(key),
  async canNotify() { return (await Notifications.getPermissionsAsync()).granted; }
};
