import { localDate } from '@worksight/core/date';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDb } from '../../src/db/expoDb';
import { getSetting } from '../../src/db/settings';
import { isPlus } from '../../src/plus/plus';
import { clockShort, dayLabel, shiftDay } from '../../src/report/days';
import { liveDeps } from '../../src/report/run';
import { firstDataDay, reportScreen, type ReportScreen } from '../../src/report/screen';
import { shareReportPdf } from '../../src/report/share';
import { setPlanDone, type Highlight } from '../../src/report/store';
import { rewriteReport } from '../../src/report/writer';
import { C, F } from '../../src/theme';
import { Icon, type IconName } from '../../src/ui/icons';
import { rise } from '../../src/ui/motion';

const HL: Record<Highlight['kind'], { icon: IconName; bg: string }> = {
  quiet: { icon: 'clock', bg: '#BFEBD3' }, opened: { icon: 'social', bg: '#CFE6FB' },
  longest: { icon: 'target', bg: '#F4C6C8' }, late: { icon: 'moon', bg: '#F9DDB9' }
};

type Note = 'failed' | 'limit' | 'pdf' | null;

export default function Report() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState(() => localDate(Date.now()));
  const [view, setView] = useState<ReportScreen | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [first, setFirst] = useState<string | null>(null);
  const sharing = useRef(false);
  const dayRef = useRef(day);
  dayRef.current = day;

  useEffect(() => { if (params.day) setDay(params.day); }, [params.day]);
  useEffect(() => { setNote(null); }, [day]);
  const load = useCallback(() => {
    const d = dayRef.current;
    try {
      const v = reportScreen(getDb(), d, Date.now());
      const f = firstDataDay(getDb());
      if (dayRef.current === d) { setView(v); setFirst(f); }
    } catch (e) {
      console.warn('daily: report failed to load', e);
      if (dayRef.current === d) setView(null);
    }
  }, [day]);
  useFocusEffect(load);

  if (!view || view.day !== day) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const db = getDb();
  const today = localDate(Date.now());
  const plus = isPlus(db);
  const canBack = day > (first ?? today);
  const canForward = day < today;

  const rewrite = async () => {
    if (busy) return;
    const d = day;
    setBusy(true);
    setNote(null);
    try {
      const err = await rewriteReport(db, d, Date.now(), liveDeps());
      if (dayRef.current === d) setNote(err === 'limit' ? 'limit' : err ? 'failed' : null);
    } catch (e) {
      console.warn('daily: rewrite failed', e);
      if (dayRef.current === d) setNote('failed');
    } finally {
      setBusy(false);
      load();
    }
  };
  const share = () => {
    if (sharing.current) return;
    sharing.current = true;
    const d = day;
    shareReportPdf({ dateLabel: dayLabel(d), headline: view.headline, story: view.story, highlights: view.highlights, plan: view.plan })
      .catch((e) => { console.warn('daily: PDF share failed', e); if (dayRef.current === d) setNote('pdf'); })
      .finally(() => { sharing.current = false; });
  };
  const toggle = (i: number) => { setPlanDone(db, day, i, !view.plan[i].done); load(); };
  const showFailed = note === 'failed' || (note === null && plus && view.aiError === 'failed');

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}>
      <Animated.View entering={rise(0)} style={s.header}>
        <Text style={s.h1}>Report</Text>
        <View style={s.dayNav}>
          <Pressable onPress={() => setDay(shiftDay(day, -1))} disabled={!canBack} accessibilityRole="button" accessibilityLabel="Previous day" accessibilityState={{ disabled: !canBack }} style={[s.navBtn, !canBack && s.off]}><Icon name="back" size={16} /></Pressable>
          <Text style={s.dayText}>{day === today ? 'Today' : dayLabel(day)}</Text>
          <Pressable onPress={() => setDay(shiftDay(day, 1))} disabled={!canForward} accessibilityRole="button" accessibilityLabel="Next day" accessibilityState={{ disabled: !canForward }} style={[s.navBtn, !canForward && s.off]}><Icon name="forward" size={16} /></Pressable>
        </View>
      </Animated.View>

      {view.empty ? (
        <Animated.View entering={rise(1)} style={s.box}><Text style={s.muted}>No phone time recorded on this day.</Text></Animated.View>
      ) : (
        <>
          <Animated.View key={`${day}-${view.kind}-${view.headline}`} entering={rise(1)} style={s.story}>
            <Text style={s.eyebrow}>{view.story ? 'Your day, written' : 'Your day'}</Text>
            <Text style={s.headline}>{view.headline}</Text>
            {view.story && <Text style={s.storyText}>{view.story}</Text>}
          </Animated.View>

          {!view.saved && day === today && <Text style={s.muted}>Daily writes your full report at {clockShort(getSetting(db, 'write_time'))}.</Text>}
          {showFailed && (
            <View style={s.noteRow}>
              <Text style={s.noteText}>Couldn't write today's story.</Text>
              <Pressable onPress={rewrite} disabled={busy} accessibilityRole="button" style={s.link}><Text style={s.linkText}>Retry</Text></Pressable>
            </View>
          )}
          {note === 'limit' && <Text style={s.noteText}>You've used today's rewrites</Text>}
          {note === 'pdf' && <Text style={s.noteText}>Couldn't make the PDF. Try again.</Text>}

          <Animated.View entering={rise(2)} style={[s.box, { paddingVertical: 6 }]}>
            {view.highlights.map((h, i) => (
              <View key={h.kind} style={[s.hl, i > 0 && s.hlLine]}>
                <View style={[s.hlIco, { backgroundColor: HL[h.kind].bg }]}><Icon name={HL[h.kind].icon} size={16} /></View>
                <Text style={s.hlLabel}>{h.label}</Text>
                <Text style={s.hlValue}>{h.value}</Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View entering={rise(3)} style={s.box}>
            <Text style={s.sec}>Tomorrow, try</Text>
            {view.plan.map((p, i) => (
              <Pressable key={i} onPress={() => toggle(i)} disabled={!view.saved} accessibilityRole="checkbox" accessibilityState={{ checked: p.done, disabled: !view.saved }} style={s.plan}>
                <View style={[s.check, p.done && s.checkOn]}>{p.done && <Icon name="check" size={14} color={C.white} />}</View>
                <Text style={[s.planText, p.done && s.planDone]}>{p.text}</Text>
              </Pressable>
            ))}
          </Animated.View>

          <Animated.View entering={rise(4)} style={s.actions}>
            <Pressable onPress={share} accessibilityRole="button" style={[s.btn, s.btnDark]}>
              <Icon name="share" size={16} color={C.white} /><Text style={[s.btnText, { color: C.white }]}>Share PDF</Text>
            </Pressable>
            {plus && (
              <Pressable onPress={rewrite} disabled={busy} accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} style={[s.btn, s.btnLight]}>
                {busy ? <ActivityIndicator color={C.ink} /> : <Icon name="refresh" size={16} />}
                <Text style={s.btnText}>{view.saved ? 'Rewrite' : 'Write it now'}</Text>
              </Pressable>
            )}
          </Animated.View>

          {!plus && (
            <Animated.View entering={rise(5)} style={s.upsell}>
              <Text style={s.upsellTitle}>Daily Plus</Text>
              <Text style={s.upsellBody}>Get your day written as a short story every evening, plus a sentence about each week.</Text>
            </Animated.View>
          )}
          <Text style={s.footer}>{view.kind === 'ai' ? 'Written by Daily Plus · only app names and times are sent' : 'Made on this phone'}</Text>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', height: 44 },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  dayNav: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 999 },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.3 },
  dayText: { fontFamily: F.semi, fontSize: 13, color: C.ink },
  story: { backgroundColor: '#D8D2FC', borderRadius: 24, paddingVertical: 20, paddingHorizontal: 18 },
  eyebrow: { fontFamily: F.semi, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(0,0,0,0.6)' },
  headline: { fontFamily: F.regular, fontSize: 22, lineHeight: 28, color: C.ink, marginTop: 10 },
  storyText: { fontFamily: F.regular, fontSize: 14, lineHeight: 21, color: 'rgba(0,0,0,0.75)', marginTop: 12 },
  box: { backgroundColor: C.white, borderRadius: 20, padding: 16 },
  muted: { fontFamily: F.regular, fontSize: 13, color: C.muted },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteText: { fontFamily: F.regular, fontSize: 13, color: C.body },
  link: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 6 },
  linkText: { fontFamily: F.semi, fontSize: 13, color: C.ink, textDecorationLine: 'underline' },
  hl: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  hlLine: { borderTopWidth: 1, borderTopColor: '#F0E9E3' },
  hlIco: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  hlLabel: { fontFamily: F.regular, fontSize: 13, color: C.ink },
  hlValue: { marginLeft: 'auto', fontFamily: F.semi, fontSize: 13, color: C.ink, flexShrink: 1, textAlign: 'right' },
  sec: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginBottom: 4 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.ink },
  planText: { flex: 1, fontFamily: F.regular, fontSize: 14, color: C.ink },
  planDone: { color: C.muted, textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, minHeight: 48, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnDark: { backgroundColor: C.ink },
  btnLight: { backgroundColor: C.white },
  btnText: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  upsell: { backgroundColor: C.panel, borderRadius: 20, padding: 16, gap: 4 },
  upsellTitle: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  upsellBody: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.body },
  footer: { fontFamily: F.regular, fontSize: 12, color: C.muted, textAlign: 'center' }
});
