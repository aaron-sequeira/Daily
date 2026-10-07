import { reminderTitle, type Reminder } from '@worksight/core/reminders';

export type ReminderCategory = 'water' | 'break' | 'nudge';
export type ReminderContent = { reminderId: number; title: string; body: string; category: ReminderCategory };

/** What Daily asks the OS for. expoNotifier implements it; tests use FakeNotifier. */
export interface Notifier {
  scheduleAt(key: string, content: ReminderContent, atMs: number): Promise<void>;
  showNow(key: string, content: ReminderContent): Promise<void>;
  cancel(key: string): Promise<void>;
  scheduledKeys(): Promise<string[]>;
  dismiss(key: string): Promise<void>;
  canNotify(): Promise<boolean>;
  showCoach(key: string, title: string, body: string): Promise<void>;
}

export function reminderContent(r: Reminder): ReminderContent {
  const category: ReminderCategory = r.builtin === 'water' ? 'water' : r.breakSec > 0 ? 'break' : 'nudge';
  return { reminderId: r.id, title: reminderTitle(r), body: r.message, category };
}
