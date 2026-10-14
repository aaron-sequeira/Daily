import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type ScreenTimeStatus = 'approved' | 'denied' | 'notDetermined';
export type ScreenTimeApi = {
  authStatus(): ScreenTimeStatus;
  requestAuth(): Promise<ScreenTimeStatus>;
  hasSelection(): boolean;
  /** Apple's app picker; true when the user chose something and tapped Done. */
  pickApps(): Promise<boolean>;
  startMonitoring(minutes: number[]): Promise<void>;
  milestones(): { min: number; atMs: number }[];
  clearMilestones(): void;
};

const native = requireOptionalNativeModule<ScreenTimeApi>('DailyScreenTime');

/** iPhone Screen Time; null on Android (which reads usage itself). */
export const screenTime: ScreenTimeApi | null = native;

type ReportProps = { context: 'today' | 'weekChart' | 'weekApps'; /** week contexts: the week's first day (ms) */ startMs?: number; style?: StyleProp<ViewStyle> };
/** Apple's Screen Time report, drawn by the ScreenTimeReport extension; only exists on iPhone. */
export const ScreenTimeReport: ComponentType<ReportProps> | null = native ? requireNativeView<ReportProps>('DailyScreenTime') : null;
