import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import DailyNative from '../../modules/daily-native';
import { getDb } from '../db/expoDb';
import { runSync } from '../tracking/runSync';
import { loadToday } from './load';
import type { TodayView } from './build';

export function useToday() {
  const [view, setView] = useState<TodayView | null>(null);
  const [access, setAccess] = useState(true);

  const refresh = useCallback(async () => {
    const result = await runSync().catch(() => 'ok' as const); // a failed sync still shows what's stored
    setAccess(result !== 'no_access' && DailyNative.hasUsageAccess());
    setView(loadToday(getDb(), Date.now()));
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [refresh]));

  return { view, access, refresh };
}
