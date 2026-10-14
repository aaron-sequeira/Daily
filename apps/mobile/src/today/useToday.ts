import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import DailyNative from '../../modules/daily-native';
import { getDb } from '../db/expoDb';
import { FEATURES } from '../platformNow';
import { phoneMinNow, screenTimeReady } from '../screentime/live';
import { withPhoneTime } from '../screentime/today';
import { runSync } from '../tracking/runSync';
import { loadToday } from './load';
import type { TodayView } from './build';

export function useToday() {
  const [view, setView] = useState<TodayView | null>(null);
  const [access, setAccess] = useState(true);

  const refresh = useCallback(async () => {
    try {
      let result: 'ok' | 'no_access' = 'ok';
      try {
        result = await runSync();
      } catch (e) {
        console.warn('daily: sync failed', e); // a failed sync still shows what's stored
      }
      const now = Date.now();
      if (FEATURES.screenTime) {
        // iPhone: Screen Time milestones stand in for app sessions, which iOS never gives Daily
        setAccess(screenTimeReady());
        setView(withPhoneTime(loadToday(getDb(), now), phoneMinNow(now) ?? 0));
      } else {
        setAccess(result !== 'no_access' && DailyNative.hasUsageAccess());
        setView(loadToday(getDb(), now));
      }
    } catch (e) {
      console.warn('daily: refresh failed', e); // keep the previous view
    }
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [refresh]));

  return { view, access, refresh };
}
