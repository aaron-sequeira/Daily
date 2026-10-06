import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { formatClock, ringOffset, secondsLeft } from '../src/break/countdown';
import { Scene } from '../src/break/Scene';
import { getDb } from '../src/db/expoDb';
import { SNOOZE_MS } from '../src/reminders/actions';
import { ANIM_LOOK, sceneKind } from '../src/reminders/defaults';
import { expoNotifier } from '../src/reminders/expoNotifier';
import { reminderContent } from '../src/reminders/notifier';
import { getReminder, logWater, markDone } from '../src/reminders/store';
import { C, F } from '../src/theme';

const R = 140;
const CIRC = 2 * Math.PI * R;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function Break() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reminder = useMemo(() => getReminder(getDb(), Number(id)), [id]);
  const total = reminder?.breakSec || 60;
  const [start] = useState(() => Date.now());
  const [left, setLeft] = useState(total);
  const done = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setLeft(secondsLeft(start, total, Date.now())), 500);
    return () => clearInterval(t);
  }, [start, total]);

  if (!reminder) {
    return (
      <View style={[s.root, { backgroundColor: C.bg, paddingTop: insets.top + 40 }]}>
        <Text style={s.title}>This reminder is gone</Text>
        <Pressable onPress={leave} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>Back</Text></Pressable>
      </View>
    );
  }

  const kind = sceneKind(reminder.animation);
  const look = ANIM_LOOK[kind];
  const isWater = reminder.builtin === 'water';

  const lock = () => {
    if (done.current) return false;
    done.current = true;
    setBusy(true);
    return true;
  };
  const finish = () => {
    if (!lock()) return;
    const db = getDb();
    if (isWater) logWater(db, Date.now());
    markDone(db, reminder.id, Date.now());
    leave();
  };
  const snooze = () => {
    if (!lock()) return;
    expoNotifier.scheduleAt(`snooze-${reminder.id}`, reminderContent(reminder), Date.now() + SNOOZE_MS)
      .catch((e) => console.warn('daily: snooze failed', e))
      .finally(leave);
  };

  return (
    <View style={[s.root, { backgroundColor: look.color, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <Text style={s.kicker}>{look.label} break</Text>
      <View style={s.stage}>
        <Svg width={300} height={300} viewBox="0 0 300 300" style={StyleSheet.absoluteFill}>
          <Circle cx="150" cy="150" r={R} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={6} />
          <Circle cx="150" cy="150" r={R} fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={ringOffset(left, total, CIRC)} transform="rotate(-90 150 150)" />
        </Svg>
        <Scene kind={kind} size={200} />
      </View>
      <Text style={s.clock} accessibilityLabel={`${formatClock(left)} left`}>{formatClock(left)}</Text>
      <Text style={s.title}>{left === 0 ? 'Nice. Back to it' : look.breakTitle}</Text>
      <Text style={s.body}>{reminder.message}</Text>
      <View style={s.actions}>
        <Pressable onPress={finish} disabled={busy} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{isWater ? 'I had some' : 'I’m back'}</Text></Pressable>
        <Pressable onPress={snooze} disabled={busy} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>Snooze 15 min</Text></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', paddingHorizontal: 28 },
  kicker: { fontFamily: F.semi, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(0,0,0,0.6)' },
  stage: { width: 300, height: 300, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  clock: { fontFamily: F.semi, fontSize: 48, letterSpacing: -1.4, color: C.ink, marginTop: 8, fontVariant: ['tabular-nums'] },
  title: { fontFamily: F.medium, fontSize: 26, color: C.ink, marginTop: 6, textAlign: 'center' },
  body: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: 'rgba(0,0,0,0.7)', textAlign: 'center', marginTop: 6 },
  actions: { marginTop: 'auto', alignSelf: 'stretch', gap: 8 },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  secondary: { minHeight: 48, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: F.medium, fontSize: 14, color: C.ink }
});
