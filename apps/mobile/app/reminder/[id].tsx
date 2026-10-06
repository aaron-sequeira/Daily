import { clock12 } from '@worksight/core/reminders';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDb } from '../../src/db/expoDb';
import { expoNotifier } from '../../src/reminders/expoNotifier';
import { applyReminders } from '../../src/reminders/apply';
import { ANIM_LOOK, MOBILE_ANIMATIONS } from '../../src/reminders/defaults';
import { BREAK_CHOICES, breakLabel, formFrom, stepMinutes, stepTime, toggleDay, toInput, type Form } from '../../src/reminders/form';
import { deleteReminder, getReminder, saveReminder } from '../../src/reminders/store';
import { C, F } from '../../src/theme';
import { Icon } from '../../src/ui/icons';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ReminderEditor() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = id === 'new' ? null : getReminder(getDb(), Number(id));
  const [f, setF] = useState<Form>(() => formFrom(existing));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const set = (patch: Partial<Form>) => { setError(null); setF((cur) => ({ ...cur, ...patch })); };
  const guarded = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await fn(); } finally { busyRef.current = false; setBusy(false); }
  };

  const save = () => guarded(async () => {
    const result = saveReminder(getDb(), toInput(f, existing?.id));
    if (!result.ok) { setError(result.error); return; }
    await applyReminders();
    router.back();
  });
  const remove = () => Alert.alert('Delete this reminder?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => guarded(async () => { deleteReminder(getDb(), existing!.id); await expoNotifier.cancel(`snooze-${existing!.id}`).catch((e) => console.warn('daily: cancelling snooze failed', e)); await applyReminders(); router.back(); }) }
  ]);

  const chip = (on: boolean) => [s.chip, on && { backgroundColor: C.ink }];
  const chipText = (on: boolean) => [s.chipText, on && { color: C.white }];

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={s.head}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={s.round}><Icon name="back" size={18} /></Pressable>
        <Text style={s.h1}>{existing ? 'Edit reminder' : 'New reminder'}</Text>
      </View>

      <Text style={s.label} nativeID="nameLabel">Name</Text>
      <TextInput value={f.name} onChangeText={(name) => set({ name })} maxLength={40} placeholder="Stretch" accessibilityLabelledBy="nameLabel" style={s.input} />
      <Text style={s.label} nativeID="msgLabel">Message</Text>
      <TextInput value={f.message} onChangeText={(message) => set({ message })} maxLength={120} placeholder="Stand up and reach for the sky" accessibilityLabelledBy="msgLabel" style={s.input} />

      <Text style={s.label}>Picture</Text>
      <View style={s.wrap}>
        {MOBILE_ANIMATIONS.map((a) => (
          <Pressable key={a} onPress={() => set({ animation: a })} accessibilityRole="radio" accessibilityState={{ checked: f.animation === a }} style={chip(f.animation === a)}>
            <Text style={chipText(f.animation === a)}>{ANIM_LOOK[a].label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>When</Text>
      <View style={s.wrap}>
        <Pressable onPress={() => set({ type: 'time' })} accessibilityRole="radio" accessibilityState={{ checked: f.type === 'time' }} style={chip(f.type === 'time')}><Text style={chipText(f.type === 'time')}>At a time</Text></Pressable>
        <Pressable onPress={() => set({ type: 'interval' })} accessibilityRole="radio" accessibilityState={{ checked: f.type === 'interval' }} style={chip(f.type === 'interval')}><Text style={chipText(f.type === 'interval')}>Every … of phone time</Text></Pressable>
      </View>

      {f.type === 'time' ? (
        <>
          <View style={s.stepper}>
            <Pressable onPress={() => set({ time: stepTime(f.time, -15) })} accessibilityRole="button" accessibilityLabel="15 minutes earlier" style={s.round}><Icon name="minus" /></Pressable>
            <Text style={s.big} accessibilityLiveRegion="polite">{clock12(f.time)}</Text>
            <Pressable onPress={() => set({ time: stepTime(f.time, 15) })} accessibilityRole="button" accessibilityLabel="15 minutes later" style={s.round}><Icon name="plus" /></Pressable>
          </View>
          <View style={s.wrap}>
            {DAY_LETTERS.map((d, i) => {
              const on = f.days.includes(i + 1);
              return (
                <Pressable key={i} onPress={() => set({ days: toggleDay(f.days, i + 1) })} accessibilityRole="checkbox" accessibilityLabel={DAY_NAMES[i]} accessibilityState={{ checked: on }} style={[s.day, on && { backgroundColor: C.ink }]}>
                  <Text style={chipText(on)}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <View style={s.stepper}>
          <Pressable onPress={() => set({ minutes: stepMinutes(f.minutes, -15) })} accessibilityRole="button" accessibilityLabel="Less" style={s.round}><Icon name="minus" /></Pressable>
          <Text style={s.big} accessibilityLiveRegion="polite">{f.minutes} min</Text>
          <Pressable onPress={() => set({ minutes: stepMinutes(f.minutes, 15) })} accessibilityRole="button" accessibilityLabel="More" style={s.round}><Icon name="plus" /></Pressable>
        </View>
      )}

      <Text style={s.label}>Break</Text>
      <View style={s.wrap}>
        {BREAK_CHOICES.map((b) => (
          <Pressable key={b} onPress={() => set({ breakSec: b })} accessibilityRole="radio" accessibilityState={{ checked: f.breakSec === b }} style={chip(f.breakSec === b)}>
            <Text style={chipText(f.breakSec === b)}>{breakLabel(b)}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={s.error} accessibilityLiveRegion="assertive">{error}</Text>}
      <Pressable onPress={save} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} style={[s.primary, busy && { opacity: 0.5 }]}><Text style={s.primaryText}>Save</Text></Pressable>
      {existing && !existing.builtin && (
        <Pressable onPress={remove} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} style={[s.secondary, busy && { opacity: 0.5 }]}><Text style={[s.primaryText, { color: C.danger }]}>Delete</Text></Pressable>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginBottom: -6, marginLeft: 2 },
  input: { backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, minHeight: 48, fontFamily: F.regular, fontSize: 15, color: C.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.white, justifyContent: 'center' },
  chipText: { fontFamily: F.medium, fontSize: 13, color: C.ink },
  day: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 18, alignSelf: 'center' },
  big: { fontFamily: F.semi, fontSize: 28, color: C.ink, minWidth: 130, textAlign: 'center' },
  error: { fontFamily: F.medium, fontSize: 13, color: C.danger },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }
});
