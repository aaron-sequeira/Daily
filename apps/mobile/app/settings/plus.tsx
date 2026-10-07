import { localDate } from '@worksight/core/date';
import { clock12 } from '@worksight/core/reminders';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDb } from '../../src/db/expoDb';
import { getSetting } from '../../src/db/settings';
import { savePercent, type Offer } from '../../src/plus/billing';
import { saveEntitlement } from '../../src/plus/entitlement';
import { getBilling } from '../../src/plus/getBilling';
import { yearlyInsteadOf } from '../../src/plus/price';
import { linkUser } from '../../src/plus/start';
import { ensureUserId } from '../../src/plus/supabase';
import { plusStatus, REWRITES_PER_DAY, rewritesLeft, type PlusStatus } from '../../src/plus/status';
import { shiftDay, weekStartOf } from '../../src/report/days';
import { loadReport, loadWeekSentence } from '../../src/report/store';
import { expoNotifier } from '../../src/reminders/expoNotifier';
import { Sunny } from '../../src/sunny/Sunny';
import { C, EASE, F } from '../../src/theme';
import { Icon } from '../../src/ui/icons';
import { rise } from '../../src/ui/motion';

type Snapshot = { status: PlusStatus | null; storySaved: boolean; writeAt: string; left: number; weekDone: boolean };

function read(): Snapshot {
  const db = getDb();
  const now = Date.now();
  const today = localDate(now);
  const lastWeek = shiftDay(weekStartOf(today), -7);
  return {
    status: plusStatus(db, now),
    storySaved: loadReport(db, today) !== null,
    writeAt: clock12(getSetting(db, 'write_time')),
    left: rewritesLeft(db, now),
    weekDone: loadWeekSentence(db, lastWeek) !== null
  };
}

export default function Subscription() {
  const insets = useSafeAreaInsets();
  const [v, setV] = useState<Snapshot>(read);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);
  useFocusEffect(useCallback(() => { setV(read()); }, []));
  useEffect(() => { getBilling().offers().then(setOffers).catch(() => setOffers([])); }, []);

  const status = v.status;
  const yearly = offers?.find((o) => o.plan === 'yearly');
  const monthly = offers?.find((o) => o.plan === 'monthly');
  const save = offers ? savePercent(offers) : null;

  async function restore() {
    if (busy.current) return;
    busy.current = true;
    setRestoring(true);
    setNote(null);
    try {
      await linkUser({ billing: getBilling(), ensureUserId });
      const ent = await getBilling().restore();
      await saveEntitlement(getDb(), ent, expoNotifier, Date.now());
      if (!ent.active) setNote('No Daily Plus purchase found for this Google account.');
    } catch {
      setNote('Couldn’t reach Google Play. Check your connection and try again.');
    } finally {
      setV(read());
      busy.current = false;
      setRestoring(false);
    }
  }
  const manage = () => {
    try { Linking.openURL(getBilling().manageUrl(status?.plan ?? null)).catch(() => {}); } catch { /* no store to open */ }
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
      <Animated.View entering={rise(0)} style={s.head}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} accessibilityLabel="Back to Settings" style={s.round}><Icon name="back" size={18} /></Pressable>
        <Text style={s.h1}>Daily Plus</Text>
      </Animated.View>

      {status ? (
        <>
          <Animated.View entering={rise(1)} style={s.card}>
            <Text style={s.plusPill}>PLUS</Text>
            <View style={s.cardTop}>
              <Sunny face="glowing" size={64} />
              <View style={{ flex: 1, paddingRight: 44 }}>
                <Text style={s.title}>{status.title}</Text>
                <Text style={s.sub}>{status.sub}</Text>
              </View>
            </View>
            {status.trialDay !== null && (
              <>
                <TrialBar fraction={status.trialDay / status.trialDays} />
                <Text style={s.trialNote}>{trialLine(status, yearly, monthly)}</Text>
              </>
            )}
          </Animated.View>

          {status.monthly && (
            <Animated.View entering={rise(2)}>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/paywall', params: { change: 'yearly' } })} style={s.switch}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchTitle}>Switch to yearly</Text>
                  {yearly && <Text style={s.switchSub}>{monthly ? yearlyInsteadOf(monthly, yearly) : `${yearly.priceString} a year`}</Text>}
                </View>
                {save !== null && <Text style={s.save}>SAVE {save}%</Text>}
              </Pressable>
            </Animated.View>
          )}

          <Section i={3} label="Today">
            <View style={s.row}><Text style={s.rowText}>Tonight’s story</Text><Text style={s.value}>{v.storySaved ? 'Written' : 'Coming'} at {v.writeAt}</Text></View>
            <View style={s.row} accessible accessibilityLabel={`Rewrites today, ${v.left} left`}>
              <Text style={s.rowText}>Rewrites today</Text>
              <View style={s.pips}>
                {Array.from({ length: REWRITES_PER_DAY }, (_, i) => <View key={i} style={[s.pip, i < REWRITES_PER_DAY - v.left && s.pipUsed]} />)}
                <Text style={s.pipText}>{v.left} left</Text>
              </View>
            </View>
            <View style={s.row}><Text style={s.rowText}>Week in a sentence</Text><Text style={s.value}>{v.weekDone ? 'Written for last week' : 'Arrives when the week ends'}</Text></View>
          </Section>

          <Section i={4} label="Your plan">
            <Pressable accessibilityRole="button" onPress={manage} style={s.row}><Text style={s.rowText}>Manage in Google Play</Text><View style={s.end}><Icon name="external" size={15} /></View></Pressable>
            <Pressable accessibilityRole="button" onPress={restore} disabled={restoring} style={s.row}>
              <Text style={s.rowText}>Restore purchases</Text>
              {restoring && <ActivityIndicator size="small" color={C.ink} style={{ marginLeft: 'auto' }} />}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/paywall')} style={s.row}><Text style={s.rowText}>See what’s included</Text><View style={s.end}><Icon name="forward" size={15} /></View></Pressable>
          </Section>
          {note ? <Text style={[s.foot, { marginTop: 10 }]}>{note}</Text> : null}

          <Animated.Text entering={rise(5)} style={s.foot}>To write your story, Daily Plus sends app names and minutes only — never messages, notifications or what’s on your screen. Google Play handles your subscription; cancel there anytime and Plus stays on until the period ends.</Animated.Text>
        </>
      ) : (
        <Animated.View entering={rise(1)} style={s.lapsed}>
          <Text style={s.lapsedPill}>DAILY PLUS</Text>
          <Text style={s.lapsedH}>Let Sunny write your day</Text>
          <Text style={s.lapsedSub}>Your phone time, turned into a short, kind story every evening.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/paywall')} style={s.cta}><Text style={s.ctaText}>See Daily Plus</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={restore} disabled={restoring} style={s.textBtn}>
            {restoring ? <ActivityIndicator size="small" color={C.ink} /> : <Text style={s.textBtnText}>Restore purchases</Text>}
          </Pressable>
          {note ? <Text style={s.foot}>{note}</Text> : null}
        </Animated.View>
      )}
    </ScrollView>
  );
}

function trialLine(status: PlusStatus, yearly?: Offer, monthly?: Offer): string {
  const o = status.monthly ? monthly : yearly;
  const then = o ? `Then ${o.priceString} a ${status.monthly ? 'month' : 'year'}. ` : '';
  return `${then}We’ll remind you two days before. Cancel before it ends and you won’t pay.`;
}

function TrialBar({ fraction }: { fraction: number }) {
  const reduced = useReducedMotion();
  const w = useSharedValue(reduced ? fraction : 0);
  useEffect(() => { w.value = reduced ? fraction : withDelay(300, withTiming(fraction, { duration: 1000, easing: EASE })); }, [fraction, reduced, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return <View style={s.track}><Animated.View style={[s.fill, fill]} /></View>;
}

function Section({ i, label, children }: { i: number; label: string; children: ReactNode }) {
  return (
    <Animated.View entering={rise(i)}>
      <Text style={s.label}>{label}</Text>
      <View style={s.group}>{children}</View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, marginBottom: 10 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  card: { backgroundColor: '#FCEBC9', borderRadius: 24, padding: 18, overflow: 'hidden' },
  plusPill: { position: 'absolute', top: 16, right: 16, zIndex: 1, backgroundColor: C.ink, color: '#FFC861', fontFamily: F.semi, fontSize: 10, letterSpacing: 1.2, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: F.semi, fontSize: 19, letterSpacing: -0.2, color: C.ink },
  sub: { fontFamily: F.regular, fontSize: 13, color: 'rgba(0,0,0,0.65)', marginTop: 2 },
  track: { marginTop: 14, height: 8, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99, backgroundColor: C.ink },
  trialNote: { fontFamily: F.regular, fontSize: 12.5, lineHeight: 18, color: 'rgba(0,0,0,0.7)', marginTop: 10 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, backgroundColor: C.ink, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, minHeight: 44 },
  switchTitle: { fontFamily: F.semi, fontSize: 14, color: C.white },
  switchSub: { fontFamily: F.regular, fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  save: { backgroundColor: '#F6B35E', color: '#3A2412', fontFamily: F.semi, fontSize: 11, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden' },
  label: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 16, marginBottom: 6, marginLeft: 2 },
  group: { backgroundColor: C.white, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F0E9E3' },
  rowText: { fontFamily: F.regular, fontSize: 14, color: C.ink },
  value: { marginLeft: 'auto', fontFamily: F.regular, fontSize: 13, color: C.muted },
  end: { marginLeft: 'auto' },
  pips: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  pip: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.line },
  pipUsed: { backgroundColor: C.ink },
  pipText: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginLeft: 2 },
  foot: { fontFamily: F.regular, fontSize: 12, lineHeight: 18, color: C.muted, marginTop: 16, marginHorizontal: 2 },
  lapsed: { alignItems: 'center', marginTop: 24 },
  lapsedPill: { backgroundColor: C.ink, color: '#FFC861', fontFamily: F.semi, fontSize: 11, letterSpacing: 1.3, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden' },
  lapsedH: { fontFamily: F.semi, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: C.ink, marginTop: 10, textAlign: 'center' },
  lapsedSub: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.body, marginTop: 8, marginHorizontal: 18, textAlign: 'center' },
  cta: { alignSelf: 'stretch', minHeight: 56, borderRadius: 28, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  ctaText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  textBtn: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  textBtnText: { fontFamily: F.semi, fontSize: 13, color: C.ink }
});
