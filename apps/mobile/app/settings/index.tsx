import { File, Paths } from 'expo-file-system';
import { Link, router, useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { clock12 } from '@worksight/core/reminders';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import DailyNative from '../../modules/daily-native';
import { account, firstName, SIGN_IN_MESSAGE, signedIn, signInWithGoogle, signOut, type Account } from '../../src/account/account';
import { getDb } from '../../src/db/expoDb';
import { getNumber, getSetting, setSetting } from '../../src/db/settings';
import { canStepWindDown, stepWindDown } from '../../src/coach/rules';
import { isPlus } from '../../src/plus/plus';
import { resyncPlus } from '../../src/plus/start';
import { plusStatus } from '../../src/plus/status';
import { canStepWriteTime, stepWriteTime } from '../../src/report/days';
import { deleteEverything, exportJson, RETENTION_CHOICES, seedSampleDay } from '../../src/settings/data';
import { syncSunnyService } from '../../src/sunny/service';
import { runSync } from '../../src/tracking/runSync';
import { Sunny } from '../../src/sunny/Sunny';
import { C, F } from '../../src/theme';
import { GoalStepper } from '../../src/ui/GoalStepper';
import { GoogleG } from '../../src/ui/GoogleButton';
import { SafeScreen } from '../../src/ui/SafeScreen';
import { Icon } from '../../src/ui/icons';
import { rise } from '../../src/ui/motion';

export default function Settings() {
  const db = getDb();
  const [goal, setGoal] = useState(() => getNumber(db, 'goal_min'));
  const [notifOff, setNotifOff] = useState(false);
  useFocusEffect(useCallback(() => {
    const check = () => { Notifications.getPermissionsAsync().then((p) => setNotifOff(!p.granted)).catch(() => {}); };
    check();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    return () => sub.remove();
  }, []));
  const [sunny, setSunny] = useState(() => getSetting(db, 'sunny_service') === '1');
  const [bubbleOn, setBubbleOn] = useState(() => getSetting(db, 'bubble') === '1');
  const [noOverlay, setNoOverlay] = useState(false);
  useFocusEffect(useCallback(() => {
    const check = () => { try { setNoOverlay(!DailyNative.canDrawOverlays()); } catch { setNoOverlay(false); } };
    check();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    return () => sub.remove();
  }, []));
  const [plusNow, setPlusNow] = useState(() => isPlus(db, Date.now()));
  useFocusEffect(useCallback(() => { setPlusNow(isPlus(db, Date.now())); }, [db]));
  const toggleBubble = (on: boolean) => {
    if (on && !isPlus(db, Date.now())) { router.push('/paywall'); return; }
    setBubbleOn(on); setSetting(db, 'bubble', on ? '1' : '0');
    try {
      if (on) { if (!DailyNative.canDrawOverlays()) DailyNative.openOverlaySettings(); }
      else DailyNative.updateBubble(false, 'happy');
    } catch (e) { console.warn('daily: bubble toggle failed', e); }
  };
  const [writeAt, setWriteAt] = useState(() => getSetting(db, 'write_time'));
  const [plusDev, setPlusDev] = useState(() => getSetting(db, 'dev_plus') === '1');
  const [windDown, setWindDown] = useState(() => getSetting(db, 'wind_down'));
  const [retention, setRetention] = useState(() => getNumber(db, 'retention_days'));

  const [status, setStatus] = useState(() => plusStatus(db, Date.now()));
  useFocusEffect(useCallback(() => { setStatus(plusStatus(db, Date.now())); setPlusDev(getSetting(db, 'dev_plus') === '1'); }, [db]));

  const [acct, setAcct] = useState<Account | null>(null);
  useFocusEffect(useCallback(() => { account().then(setAcct).catch(() => setAcct(null)); }, []));
  const [signingIn, setSigningIn] = useState(false);
  const [acctNote, setAcctNote] = useState<string | null>(null);
  const refreshPlus = () => { setStatus(plusStatus(db, Date.now())); setPlusNow(isPlus(db, Date.now())); };
  const google = async () => {
    if (signingIn) return;
    setSigningIn(true);
    setAcctNote(null);
    const r = await signInWithGoogle();
    if (signedIn(r)) { setAcct(await account().catch(() => null)); refreshPlus(); } else setAcctNote(SIGN_IN_MESSAGE[r] ?? null);
    setSigningIn(false);
  };
  const confirmSignOut = () => Alert.alert('Sign out?', 'Daily Plus stays with your Google account. Sign in again to get it back on this phone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => {
      setAcctNote(null);
      void signOut().catch(() => 'Couldn’t sign out. Try again.').then((msg) => { if (msg) setAcctNote(msg); else { setAcct(null); refreshPlus(); } });
    } }
  ]);

  const changeGoal = (min: number) => { setGoal(min); setSetting(db, 'goal_min', min); };
  const cycleRetention = () => {
    const next = RETENTION_CHOICES[(RETENTION_CHOICES.indexOf(retention as (typeof RETENTION_CHOICES)[number]) + 1) % RETENTION_CHOICES.length];
    const apply = () => { setRetention(next); setSetting(db, 'retention_days', next); };
    if (next >= retention) { apply(); return; }
    Alert.alert(`Keep only ${next} days?`, `History older than ${next} days will be deleted the next time Daily updates.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Keep ${next} days`, style: 'destructive', onPress: apply }
    ]);
  };
  const exportData = async () => {
    const file = new File(Paths.cache, 'daily-export.json');
    file.write(exportJson(db));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  };
  const wipe = async () => {
    await runSync().catch(() => {}); // let any sync that already started finish, so none can write after the delete
    deleteEverything(db, Date.now());
    syncSunnyService(db, DailyNative);
    await Notifications.cancelAllScheduledNotificationsAsync().catch((e) => console.warn('daily: cancelling alarms failed', e));
    await Notifications.dismissAllNotificationsAsync().catch((e) => console.warn('daily: dismissing notifications failed', e));
    // The subscription outlives Delete everything: bring the plus_* cache and the trial reminder (cancelled above) back.
    void resyncPlus();
    try {
      const file = new File(Paths.cache, 'daily-export.json');
      if (file.exists) file.delete();
    } catch { /* the cached export is best effort */ }
    router.replace('/onboarding');
  };
  const confirmDelete = () => Alert.alert('Delete everything?', 'This removes all of Daily’s history from this phone. It can’t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void wipe(); } }
  ]);

  return (
    <SafeScreen>
    <ScrollView contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 24 }}>
      <Animated.View entering={rise(0)} style={s.head}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} accessibilityLabel="Back to Today" style={s.round}><Icon name="back" size={18} /></Pressable>
        <Text style={s.h1}>Settings</Text>
      </Animated.View>

      <Group i={1} label="Account">
        {acct ? (
          <>
            <View style={[s.row, { paddingVertical: 10 }]}>
              {acct.photoUrl
                ? <Image source={{ uri: acct.photoUrl }} style={s.avatar} accessibilityIgnoresInvertColors />
                : <View style={[s.avatar, s.initial]}><Text style={s.initialText}>{firstName(acct).slice(0, 1).toUpperCase()}</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.rowText}>{acct.name ?? 'Google account'}</Text>
                {acct.email ? <Text style={s.sub}>{acct.email}</Text> : null}
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={confirmSignOut} style={s.row}><Text style={s.rowText}>Sign out</Text></Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Sign in with Google" onPress={google} disabled={signingIn} style={[s.row, { paddingVertical: 10 }]}>
            <GoogleG size={20} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowText}>Sign in with Google</Text>
              <Text style={s.sub}>Keep Daily Plus if you change phones</Text>
            </View>
            {signingIn ? <ActivityIndicator size="small" color={C.ink} /> : <Icon name="forward" size={16} />}
          </Pressable>
        )}
        {acctNote ? <Text style={[s.sub, { paddingBottom: 12 }]} accessibilityLiveRegion="polite">{acctNote}</Text> : null}
      </Group>

      <Group i={2} label="Goals">
        <View style={s.row}><Sunny face="happy" size={30} /><Text style={s.rowText}>Your buddy</Text><Text style={s.value}>Sunny · more soon</Text></View>
        <View style={[s.row, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 12, gap: 10 }]}>
          <Text style={s.rowText}>Daily phone goal</Text>
          <GoalStepper value={goal} onChange={changeGoal} />
        </View>
        <View style={s.row}>
          <Text style={s.rowText}>Wind down after</Text>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable disabled={!canStepWindDown(windDown, -1)} onPress={() => { const t = stepWindDown(windDown, -1); setWindDown(t); setSetting(db, 'wind_down', t); }} accessibilityRole="button" accessibilityLabel="Earlier" accessibilityState={{ disabled: !canStepWindDown(windDown, -1) }} style={[s.small, !canStepWindDown(windDown, -1) && { opacity: 0.35 }]}><Icon name="minus" size={16} /></Pressable>
            <Text style={s.value} accessibilityLiveRegion="polite">{clock12(windDown)}</Text>
            <Pressable disabled={!canStepWindDown(windDown, 1)} onPress={() => { const t = stepWindDown(windDown, 1); setWindDown(t); setSetting(db, 'wind_down', t); }} accessibilityRole="button" accessibilityLabel="Later" accessibilityState={{ disabled: !canStepWindDown(windDown, 1) }} style={[s.small, !canStepWindDown(windDown, 1) && { opacity: 0.35 }]}><Icon name="plus" size={16} /></Pressable>
          </View>
        </View>
      </Group>

      <Group i={3} label="Sunny">
        <View style={s.row}>
          <Text style={s.rowText}>Sunny in the status bar</Text>
          <Switch value={sunny} accessibilityLabel="Sunny in the status bar" trackColor={{ false: C.line, true: C.ink }} thumbColor={C.white} style={{ marginLeft: 'auto' }}
            onValueChange={(on) => { if (on) Notifications.requestPermissionsAsync().then((p) => setNotifOff(!p.granted)).catch(() => null); setSunny(on); setSetting(db, 'sunny_service', on ? '1' : '0'); syncSunnyService(db, DailyNative); }} />
        </View>
        {sunny && notifOff && (
          <View style={s.row}>
            <Text style={[s.rowText, { flex: 1 }]}>Notifications are off, so Sunny can't show in the status bar.</Text>
            <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 12 }}>
              <Text style={[s.rowText, { fontFamily: F.semi, textDecorationLine: 'underline' }]}>Allow</Text>
            </Pressable>
          </View>
        )}
        <View style={[s.row, !sunny && { opacity: 0.4 }]}>
          <Text style={s.plusPill}>PLUS</Text>
          <Text style={s.rowText}>Floating Sunny</Text>
          {sunny ? (
            <Switch value={bubbleOn} accessibilityLabel="Floating Sunny" trackColor={{ false: C.line, true: C.ink }} thumbColor={C.white} style={{ marginLeft: 'auto' }} onValueChange={toggleBubble} />
          ) : <Text style={[s.value, { marginLeft: 'auto' }]}>Needs Sunny in the status bar</Text>}
        </View>
        {sunny && bubbleOn && !plusNow && (
          <View style={s.row}>
            <Text style={[s.rowText, { flex: 1 }]}>Floating Sunny is paused.</Text>
            <Pressable onPress={() => router.push('/paywall')} accessibilityRole="button" accessibilityLabel="Needs Daily Plus" style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 12 }}>
              <Text style={[s.value, { textDecorationLine: 'underline' }]}>Needs Daily Plus</Text>
            </Pressable>
          </View>
        )}
        {sunny && bubbleOn && noOverlay && (
          <View style={s.row}>
            <Text style={[s.rowText, { flex: 1 }]}>Daily needs “Display over other apps” to show Sunny.</Text>
            <Pressable onPress={() => { try { DailyNative.openOverlaySettings(); } catch { /* ignore */ } }} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 12 }}>
              <Text style={[s.rowText, { fontFamily: F.semi, textDecorationLine: 'underline' }]}>Allow</Text>
            </Pressable>
          </View>
        )}
        <Link href="/settings/keep-running" asChild>
          <Pressable accessibilityRole="button" style={s.row}><Text style={s.rowText}>Keep Sunny running</Text><Text style={s.value}>Help</Text></Pressable>
        </Link>
      </Group>

      <Group i={4} label="Report">
        {status ? (
          <Link href="/settings/plus" asChild>
            <Pressable accessibilityRole="button" style={s.row}><Text style={s.rowText}>Your subscription</Text><Text style={s.value}>{status.sub}</Text></Pressable>
          </Link>
        ) : (
          <Link href="/paywall" asChild>
            <Pressable accessibilityRole="button" style={s.row}>
              <Text style={s.plusPill}>PLUS</Text><Text style={s.rowText}>Daily Plus</Text>
              <Text style={[s.value, { color: C.ink, fontFamily: F.semi }]}>Try 7 days free</Text>
            </Pressable>
          </Link>
        )}
        <View style={s.row}>
          <Text style={s.rowText}>Write it at</Text>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => { const t = stepWriteTime(writeAt, -1); setWriteAt(t); setSetting(db, 'write_time', t); }} disabled={!canStepWriteTime(writeAt, -1)}
              accessibilityRole="button" accessibilityLabel="Earlier" accessibilityState={{ disabled: !canStepWriteTime(writeAt, -1) }} style={[s.small, !canStepWriteTime(writeAt, -1) && { opacity: 0.4 }]}><Icon name="minus" size={16} /></Pressable>
            <Text style={s.value} accessibilityLiveRegion="polite">{clock12(writeAt)}</Text>
            <Pressable onPress={() => { const t = stepWriteTime(writeAt, 1); setWriteAt(t); setSetting(db, 'write_time', t); }} disabled={!canStepWriteTime(writeAt, 1)}
              accessibilityRole="button" accessibilityLabel="Later" accessibilityState={{ disabled: !canStepWriteTime(writeAt, 1) }} style={[s.small, !canStepWriteTime(writeAt, 1) && { opacity: 0.4 }]}><Icon name="plus" size={16} /></Pressable>
          </View>
        </View>
      </Group>

      <Group i={5} label="Privacy">
        <Link href="/settings/categories" asChild><Pressable accessibilityRole="button" style={s.row}><Text style={s.rowText}>App categories</Text><Text style={s.value}>Edit</Text></Pressable></Link>
        <Pressable accessibilityRole="button" onPress={cycleRetention} style={s.row}><Text style={s.rowText}>Keep history for</Text><Text style={s.value}>{retention} days</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={exportData} style={s.row}><Text style={s.rowText}>Export my data</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={confirmDelete} style={s.row}><Text style={[s.rowText, { color: C.danger }]}>Delete everything</Text></Pressable>
      </Group>

      {__DEV__ && (
        <Group i={6} label="Developer">
          <View style={s.row}>
            <Text style={s.rowText}>Pretend Daily Plus</Text>
            <Switch value={plusDev} accessibilityLabel="Pretend Daily Plus" trackColor={{ false: C.line, true: C.ink }} thumbColor={C.white} style={{ marginLeft: 'auto' }}
              onValueChange={(on) => { setPlusDev(on); setSetting(db, 'dev_plus', on ? '1' : '0'); setStatus(plusStatus(db, Date.now())); }} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => { seedSampleDay(db, Date.now()); router.back(); }} style={s.row}><Text style={s.rowText}>Seed a sample day</Text></Pressable>
          <Link href="/dev/sunny" asChild><Pressable accessibilityRole="button" style={s.row}><Text style={s.rowText}>Sunny gallery</Text></Pressable></Link>
        </Group>
      )}

      <Text style={s.note}>Everything Daily records stays on this phone: app names, minutes and unlock times. Never notifications, messages or what's on your screen.</Text>
    </ScrollView>
    </SafeScreen>
  );
}

function Group({ i, label, children }: { i: number; label: string; children: ReactNode }) {
  return (
    <Animated.View entering={rise(i)}>
      <Text style={s.label}>{label}</Text>
      <View style={s.group}>{children}</View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, marginBottom: 8 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  small: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  label: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 14, marginBottom: 6, marginLeft: 2 },
  group: { backgroundColor: C.white, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F0E9E3' },
  rowText: { fontFamily: F.regular, fontSize: 14, color: C.ink },
  value: { marginLeft: 'auto', fontFamily: F.regular, fontSize: 13, color: C.muted },
  plusPill: { backgroundColor: C.ink, color: '#FFC861', fontFamily: F.semi, fontSize: 10, letterSpacing: 1, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden' },
  note: { fontFamily: F.regular, fontSize: 12, lineHeight: 18, color: C.muted, marginTop: 16, marginHorizontal: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  initial: { backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  sub: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 2 }
});
