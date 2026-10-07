import { requireNativeModule } from 'expo';

export type NativeEvent = { type: 'resumed' | 'paused' | 'screen_on' | 'screen_off' | 'unlock'; pkg: string; ts: number };
export type NativeAppInfo = { pkg: string; label: string; category: number; icon: string | null };

export type DailyNativeApi = {
  packageName(): string;
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  defaultLauncher(): string | null;
  queryEvents(fromMs: number, toMs: number): Promise<NativeEvent[]>;
  appInfo(packages: string[]): Promise<NativeAppInfo[]>;
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
  startSunnyService(): void;
  stopSunnyService(): void;
  updateChip(title: string, short: string, text: string, mood: string): void;
  openBatterySettings(): void;
};

export default requireNativeModule<DailyNativeApi>('DailyNative');
