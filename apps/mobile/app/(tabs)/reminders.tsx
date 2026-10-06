import type { Reminder } from '@worksight/core/reminders';
import { clock12, reminderSummary } from '@worksight/core/reminders';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DailyNative from '../../modules/daily-native';
import { getDb } from '../../src/db/expoDb';
import { applyReminders } from '../../src/reminders/apply';
import { ANIM_LOOK, sceneKind } from '../../src/reminders/defaults';
import { nextUpLeft, nextUpWhen } from '../../src/reminders/form';
import { nextUp, type NextUp } from '../../src/reminders/plan';
import { getStates, listReminders, setEnabled, skipToday } from '../../src/reminders/store';
import { C, F } from '../../src/theme';
import { phoneMsSince } from '../../src/tracking/sync';
import { Icon } from '../../src/ui/icons';
import { rise } from '../../src/ui/motion';

type ViewModel = { reminders: Reminder[]; next: NextUp | null; notifications: boolean; exact: boolean };

function load(): ViewModel {
  const db = getDb();
  const now = Date.now();
  const reminders = listReminders(db);
  const next = nextUp(reminders, getStates(db), now, (from) => phoneMsSince(db, from, now));
  return { reminders, next, notifications: true, exact: DailyNative.canScheduleExactAlarms() };
}

function nextLine(n: NextUp): { title: string; sub: string } {
  if (n.kind === 'clock') {
    const t = new Date(n.atMs);
    const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    return { title: `${n.reminder.name} at ${clock12(hhmm)}`, sub: nextUpWhen(n.atMs, Date.now()) };
  }
  return { title: n.reminder.name, sub: nextUpLeft(n.leftMin) };
}

export default function RemindersTab() {
  const insets = useSafeAreaInsets();
  const [vm, setVm] = useState<ViewModel | null>(null);

  const refresh = useCallback(async () => {
    try {
      const base = load();
      const perm = await Notifications.getPermissionsAsync();
      setVm({ ...base, notifications: perm.granted });
    } catch (e) { console.warn('daily: loading reminders failed', e); }
  }, []);
  useFocusEffect(useCallback(() => {
    refresh();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]));

  if (!vm) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const toggle = async (r: Reminder, on: boolean) => { try { setEnabled(getDb(), r.id, on); await applyReminders(); } catch (e) { console.warn('daily: toggling reminder failed', e); } finally { refresh(); } };
  const skip = async (r: Reminder) => { try { skipToday(getDb(), r.id, Date.now()); await applyReminders(); } catch (e) { console.warn('daily: skipping reminder failed', e); } finally { refresh(); } };
  const builtins = vm.reminders.filter((r) => r.builtin);
  const mine = vm.reminders.filter((r) => !r.builtin);
  const clockOn = vm.reminders.some((r) => r.enabled && r.schedule.type === 'time');
  const next = vm.next ? nextLine(vm.next) : null;

  const row = (r: Reminder, i: number) => {
    const look = ANIM_LOOK[sceneKind(r.animation)];
    return (
      <Animated.View key={r.id} entering={rise(3 + i)} style={s.row}>
        <Pressable onPress={() => router.push({ pathname: '/reminder/[id]', params: { id: String(r.id) } })} accessibilityRole="button" accessibilityLabel={`Edit ${r.name}`} style={s.rowMain}>
          <View style={[s.rowIco, { backgroundColor: look.color }]}><Icon name={look.icon} size={18} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{r.name}</Text>
            <Text style={s.rowSub}>{reminderSummary(r)}{r.breakSec ? ` · ${Math.round(r.breakSec / 60) || 1}-min break` : ' · just a nudge'}</Text>
          </View>
        </Pressable>
        <Switch value={r.enabled} onValueChange={(on) => toggle(r, on)} accessibilityLabel={r.name}
          trackColor={{ false: C.line, true: C.ink }} thumbColor={C.white} />
      </Animated.View>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 24, gap: 10 }}>
      <Animated.View entering={rise(0)} style={s.head}>
        <Text style={s.h1}>Reminders</Text>
        <Pressable onPress={() => router.push({ pathname: '/reminder/[id]', params: { id: 'new' } })} accessibilityRole="button" style={s.newBtn}>
          <Icon name="plus" size={15} color={C.white} /><Text style={s.newText}>New</Text>
        </Pressable>
      </Animated.View>

      {!vm.notifications && (
        <Animated.View entering={rise(1)} style={s.card}>
          <Text style={s.cardTitle}>Notifications are off</Text>
          <Text style={s.cardBody}>Daily can’t remind you until you allow notifications.</Text>
          <Pressable onPress={async () => { await Notifications.requestPermissionsAsync(); refresh(); }} accessibilityRole="button" style={s.cardBtn}><Text style={s.cardBtnText}>Allow notifications</Text></Pressable>
        </Animated.View>
      )}
      {vm.notifications && clockOn && !vm.exact && (
        <Animated.View entering={rise(1)} style={s.card}>
          <Text style={s.cardTitle}>Allow exact timing</Text>
          <Text style={s.cardBody}>Without it, lunch and tea may arrive a few minutes late.</Text>
          <Pressable onPress={() => { try { DailyNative.openExactAlarmSettings(); } catch (e) { console.warn('daily: exact alarm settings unavailable', e); } }} accessibilityRole="button" style={s.cardBtn}><Text style={s.cardBtnText}>Open settings</Text></Pressable>
        </Animated.View>
      )}

      {next && vm.next && (
        <Animated.View entering={rise(2)} style={s.next}>
          <View style={{ flex: 1 }}>
            <Text style={s.nextKicker}>Next up</Text>
            <Text style={s.nextTitle}>{next.title}</Text>
            <Text style={s.nextKicker}>{next.sub}</Text>
          </View>
          {vm.next.kind === 'clock' && (
            <Pressable onPress={() => skip(vm.next!.reminder)} accessibilityRole="button" style={s.skip}><Text style={s.skipText}>Skip today</Text></Pressable>
          )}
        </Animated.View>
      )}

      <Text style={s.label}>Daily</Text>
      {builtins.map(row)}
      {mine.length > 0 && <Text style={s.label}>Yours</Text>}
      {mine.map((r, i) => row(r, builtins.length + i))}

      <View style={s.info}>
        <Text style={s.infoText}>Water counts phone time, so it waits while you’re away. Clock reminders follow your phone’s time zone.</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', height: 44 },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  newBtn: { marginLeft: 'auto', minHeight: 44, borderRadius: 999, backgroundColor: C.ink, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  newText: { fontFamily: F.semi, fontSize: 13, color: C.white },
  card: { backgroundColor: C.white, borderRadius: 20, padding: 16, gap: 8 },
  cardTitle: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  cardBody: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.body },
  cardBtn: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.ink, justifyContent: 'center' },
  cardBtnText: { fontFamily: F.semi, fontSize: 13, color: C.white },
  next: { backgroundColor: '#F9DDB9', borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextKicker: { fontFamily: F.regular, fontSize: 12, color: 'rgba(0,0,0,0.62)' },
  nextTitle: { fontFamily: F.semi, fontSize: 20, color: C.ink, marginVertical: 2 },
  skip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center' },
  skipText: { fontFamily: F.semi, fontSize: 13, color: C.ink },
  label: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 6, marginLeft: 2 },
  row: { backgroundColor: C.white, borderRadius: 20, paddingRight: 14, minHeight: 68, flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 68 },
  rowIco: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  rowSub: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 2 },
  info: { backgroundColor: C.panel, borderRadius: 20, padding: 16, marginTop: 4 },
  infoText: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.body }
});
