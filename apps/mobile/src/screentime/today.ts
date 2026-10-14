import { moodFor } from '../sunny/mood';
import type { TodayView } from '../today/build';

/** iPhone: Today's Sunny numbers come from Screen Time milestones (Daily keeps no app sessions there). */
export function withPhoneTime(view: TodayView, phoneMin: number): TodayView {
  return { ...view, phoneMin, mood: moodFor(phoneMin, view.goalMin), leftMin: view.goalMin - phoneMin, empty: phoneMin === 0 };
}
