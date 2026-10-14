import { requireOptionalNativeModule } from 'expo';

export type IslandAction = { action: 'done' | 'snooze' | 'endBreak'; reminderId: number | null; atMs: number };
export type IslandApi = {
  isEnabled(): boolean;
  show(stateJson: string, fallbackJson: string): Promise<void>;
  end(): Promise<void>;
  takeActions(): IslandAction[];
  /** Live Activity push tokens (hex): push-to-start and the running activity's update token. */
  pushTokens(): { start: string | null; activity: string | null };
  /** Where native code posts new tokens itself (src/island/push.ts). */
  setPushConfig(functionUrl: string, deviceId: string, secret: string): void;
};

const none: IslandApi = {
  isEnabled: () => false, show: async () => {}, end: async () => {}, takeActions: () => [],
  pushTokens: () => ({ start: null, activity: null }), setPushConfig: () => {}
};
const native = requireOptionalNativeModule<IslandApi>('DailyIsland');

/** The "Sunny today" Live Activity on iPhone; Android has no module and gets the no-op. */
export const island: IslandApi = native ? {
  isEnabled: () => native.isEnabled(),
  show: (s, f) => native.show(s, f),
  end: () => native.end(),
  takeActions: () => native.takeActions().map((a) => ({ ...a, reminderId: typeof a.reminderId === 'number' && a.reminderId >= 0 ? a.reminderId : null })),
  pushTokens: () => { const t = native.pushTokens(); return { start: t?.start || null, activity: t?.activity || null }; },
  setPushConfig: (u, id, sec) => native.setPushConfig(u, id, sec)
} : none;
