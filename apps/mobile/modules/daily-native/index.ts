import { requireNativeModule } from 'expo';

export type NativeEvent = { type: 'resumed' | 'paused' | 'screen_on' | 'screen_off' | 'unlock'; pkg: string; ts: number };
export type NativeAppInfo = { pkg: string; label: string; category: number; icon: string | null };

export type GoogleSignInResult = { idToken: string; rawNonce: string; email: string; name: string | null; photoUrl: string | null };

export type DailyNativeApi = {
  packageName(): string;
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  defaultLauncher(): string | null;
  queryEvents(fromMs: number, toMs: number): Promise<NativeEvent[]>;
  appInfo(packages: string[]): Promise<NativeAppInfo[]>;
  canScheduleExactAlarms(): boolean;
  isInCall(): boolean;
  openExactAlarmSettings(): void;
  startSunnyService(): void;
  stopSunnyService(): void;
  updateChip(title: string, short: string, text: string, mood: string): void;
  openBatterySettings(): void;
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  updateBubble(visible: boolean, mood: string): void;
  showBubbleSpeech(title: string, body: string): void;
  takeBubbleActions(): string[];
  bubbleHiddenDay(): string | null;
  /** Rejects with code 'cancelled' | 'no_account' | 'failed'. */
  googleSignIn(webClientId: string): Promise<GoogleSignInResult>;
};

export default requireNativeModule<DailyNativeApi>('DailyNative');
