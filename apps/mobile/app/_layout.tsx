import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, useFonts } from '@expo-google-fonts/dm-sans';
import { File, Paths } from 'expo-file-system';
import { Redirect, Stack, useSegments } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as SplashScreen from 'expo-splash-screen';
import { deleteDatabaseSync } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { DB_NAME, getDb } from '../src/db/expoDb';
import { getSetting } from '../src/db/settings';
import { registerSyncTask } from '../src/tracking/backgroundTask';
import { C } from '../src/theme';
import { FatalScreen } from '../src/ui/FatalScreen';

SplashScreen.preventAutoHideAsync();

function openDb(): string | null {
  try { getDb(); return null; } catch (e) { return String(e); }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold });
  const [dbError, setDbError] = useState<string | null>(openDb);

  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync(); }, [fontsLoaded]);
  useEffect(() => { if (!dbError) registerSyncTask().catch(() => {}); }, [dbError]);

  if (!fontsLoaded) return null;
  if (dbError) {
    return (
      <FatalScreen
        error={dbError}
        onExport={() => { Sharing.shareAsync(new File(Paths.document, 'SQLite', DB_NAME).uri).catch((e) => setDbError(String(e))); }}
        onReset={() => {
          try { deleteDatabaseSync(DB_NAME); setDbError(openDb()); } catch (e) { setDbError(String(e)); }
        }}
      />
    );
  }
  return <Gate />;
}

function Gate() {
  const segments = useSegments();
  const onboarded = getSetting(getDb(), 'onboarded') === '1';
  if (!onboarded && segments[0] !== 'onboarding') return <Redirect href="/onboarding" />;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
    </>
  );
}
