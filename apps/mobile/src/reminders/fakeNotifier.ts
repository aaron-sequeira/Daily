import type { Notifier, ReminderContent } from './notifier';

/** Records what Daily asked the OS to do. Test-only. */
export class FakeNotifier implements Notifier {
  scheduled = new Map<string, { content: ReminderContent; atMs: number }>();
  shown: { key: string; content: ReminderContent }[] = [];
  dismissed: string[] = [];
  async scheduleAt(key: string, content: ReminderContent, atMs: number) { this.scheduled.set(key, { content, atMs }); }
  async showNow(key: string, content: ReminderContent) { this.shown.push({ key, content }); }
  async cancel(key: string) { this.scheduled.delete(key); }
  async scheduledKeys() { return [...this.scheduled.keys()]; }
  async dismiss(key: string) { this.dismissed.push(key); }
}
