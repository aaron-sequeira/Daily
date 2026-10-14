import { localDate } from '@worksight/core/date';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { ScreenTimeReport, screenTime } from '../../modules/daily-native/screenTime';
import { getDb } from '../../src/db/expoDb';
import { FEATURES } from '../../src/platformNow';
import { screenTimeReady } from '../../src/screentime/live';
import { weekAverages } from '../../src/screentime/milestones';
import { formatDuration } from '../../src/format';
import { isPlus } from '../../src/plus/plus';
import { shiftDay, weekStartOf } from '../../src/report/days';
import { liveDeps } from '../../src/report/run';
import { loadWeekSentence } from '../../src/report/store';
import { buildWeek, weekSentence, type WeekView } from '../../src/report/week';
import { ensureWeekSentence } from '../../src/report/writer';
import { C, F } from '../../src/theme';
import { CATEGORIES, CATEGORY_LOOK } from '../../src/tracking/categories';
import { rise, useFocusKey } from '../../src/ui/motion';
import { SafeScreen } from '../../src/ui/SafeScreen';

const BAR_H = 120;

/** A bar that springs up from the bottom (spec §4 motion), or just appears when animations are off. */
function GrowBar({ index, height, outlined, children }: { index: number; height: number; outlined: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  const k = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { k.value = 1; return; }
    k.value = withDelay(250 + index * 70, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [index, reduce, k]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleY: k.value }] }));
  return <Animated.View style={[s.bar, { height, transformOrigin: 'bottom' }, outlined && s.barToday, grow]}>{children}</Animated.View>;
}

function startFor(which: 'this' | 'last', nowMs: number): string {
  const thisWeek = weekStartOf(localDate(nowMs));
  return which === 'this' ? thisWeek : shiftDay(thisWeek, -7);
}

function dayLabelFor(d: WeekView['days'][number]): string {
  if (d.future) return `${d.label}: not yet`;
  const name = d.isToday ? `${d.label}, today` : d.label;
  if (d.phoneMin === 0) return `${name}: no phone time`;
  const split = CATEGORIES.filter((c) => (d.byCat[c] ?? 0) > 0).map((c) => `${CATEGORY_LOOK[c].label} ${formatDuration(d.byCat[c]!)}`).join(', ');
  return `${name}: ${formatDuration(d.phoneMin)}${split ? ` — ${split}` : ''}`;
}

/** iPhone: Apple's Screen Time drawn by the ScreenTimeReport extension (same layout as WeekBody), and the week sentence
 * from Screen Time milestones. */
function IosWeekBody({ weekStart, aiSentence }: { weekStart: string; aiSentence: string | null }) {
  const plus = isPlus(getDb());
  if (!screenTimeReady() || !ScreenTimeReport) {
    return <Animated.View entering={rise(2)} style={s.box}><Text style={s.muted}>Turn on Screen Time from Today to see your week.</Text></Animated.View>;
  }
  const now = Date.now();
  const startMs = new Date(`${weekStart}T00:00:00`).getTime();
  const current = shiftDay(weekStart, 7) > localDate(now);
  const { avg, lastAvg } = weekAverages(screenTime?.milestones() ?? [], weekStart, now);
  return (
    <>
      <Animated.View entering={rise(2)}><ScreenTimeReport context="weekChart" startMs={startMs} style={{ height: 268 }} /></Animated.View>
      <Animated.View entering={rise(3)} style={s.sentence}>
        <Text style={s.eyebrow}>Week in a sentence</Text>
        <Text style={s.sentenceText}>{aiSentence ?? weekSentence(avg, lastAvg, current)}</Text>
        {!plus && (
          <Pressable onPress={() => router.push('/paywall')} accessibilityRole="button" style={s.sentenceBtn}><Text style={s.sentenceBtnText}>Daily Plus writes this for you</Text></Pressable>
        )}
      </Animated.View>
      <Animated.View entering={rise(4)}><ScreenTimeReport context="weekApps" startMs={startMs} style={{ height: 290 }} /></Animated.View>
    </>
  );
}

function WeekBody({ view, aiSentence }: { view: WeekView; aiSentence: string | null }) {
  const plus = isPlus(getDb());
  const max = Math.max(1, ...view.days.map((d) => d.phoneMin));
  const shownCats = CATEGORIES.filter((c) => view.days.some((d) => (d.byCat[c] ?? 0) > 0));
  const topMax = Math.max(1, ...view.topApps.map((a) => a.minutes));
  const delta = view.deltaMin;

  return (
    <>
      <Animated.View entering={rise(2)} style={s.box}>
        <Text style={s.muted}>Phone time · daily average</Text>
        <View style={s.avgRow}>
          <Text style={s.avg}>{view.avgMin === null ? '—' : formatDuration(view.avgMin)}</Text>
          {delta !== null && Math.round(delta) !== 0 && (
            <Text style={[s.delta, { color: delta < 0 ? '#1F7A4D' : '#9A3B2E' }]}>{delta < 0 ? '↓' : '↑'} {formatDuration(Math.abs(delta))} vs last week</Text>
          )}
        </View>
        <View key={view.weekStart} style={s.bars}>
          {view.days.map((d, i) => (
            <View key={d.day} style={s.col} accessible accessibilityLabel={dayLabelFor(d)}>
              {d.future || d.phoneMin === 0 ? (
                <View style={[s.bar, s.barEmpty, d.isToday && s.barToday]} />
              ) : (
                <GrowBar index={i} height={Math.max(6, (BAR_H * d.phoneMin) / max)} outlined={d.isToday}>
                  {CATEGORIES.some((c) => (d.byCat[c] ?? 0) > 0)
                    ? CATEGORIES.filter((c) => (d.byCat[c] ?? 0) > 0).reverse().map((c) => (
                      <View key={c} style={{ flex: d.byCat[c]!, backgroundColor: CATEGORY_LOOK[c].color }} />
                    ))
                    : <View style={{ flex: 1, backgroundColor: C.line }} />}
                </GrowBar>
              )}
              <Text style={[s.colLabel, d.isToday && { color: C.ink, fontFamily: F.semi }]}>{d.isToday ? 'Today' : d.label}</Text>
            </View>
          ))}
        </View>
        {shownCats.length > 0 && (
          <View style={s.legend}>
            {shownCats.map((c) => (
              <View key={c} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: CATEGORY_LOOK[c].color }]} /><Text style={s.legendText}>{CATEGORY_LOOK[c].label}</Text></View>
            ))}
          </View>
        )}
      </Animated.View>

      <Animated.View entering={rise(3)} style={s.sentence}>
        <Text style={s.eyebrow}>Week in a sentence</Text>
        <Text style={s.sentenceText}>{aiSentence ?? view.sentence}</Text>
        {plus && !aiSentence && !view.complete && <Text style={s.small}>Daily Plus writes this when the week ends.</Text>}
        {!plus && (
          <Pressable onPress={() => router.push('/paywall')} accessibilityRole="button" style={s.sentenceBtn}><Text style={s.sentenceBtnText}>Daily Plus writes this for you</Text></Pressable>
        )}
      </Animated.View>

      {view.topApps.length > 0 && (
        <Animated.View entering={rise(4)} style={[s.box, { paddingVertical: 12 }]}>
          <Text style={s.muted}>Top apps · a day</Text>
          {view.topApps.map((a) => (
            <View key={a.name} style={s.app}>
              <View style={[s.appDot, { backgroundColor: CATEGORY_LOOK[a.category].color }]}><Text style={s.appLetter}>{a.name.slice(0, 1).toUpperCase()}</Text></View>
              <Text style={s.appName} numberOfLines={1}>{a.name}</Text>
              <View style={s.track}><View style={{ width: `${(a.minutes / topMax) * 100}%`, height: '100%', borderRadius: 99, backgroundColor: CATEGORY_LOOK[a.category].color }} /></View>
              <Text style={s.appMin}>{formatDuration(a.minutes)}</Text>
            </View>
          ))}
        </Animated.View>
      )}
    </>
  );
}

export default function Week() {
  const focusKey = useFocusKey();
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const [view, setView] = useState<WeekView | null>(null);
  const [aiSentence, setAiSentence] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const token = useRef(0);

  const load = useCallback(() => {
    const db = getDb();
    const now = Date.now();
    const start = startFor(which, now);
    const mine = ++token.current;
    let built: WeekView;
    try { built = buildWeek(db, start, now); setView(built); setFailed(false); } catch (e) { console.warn('daily: week failed to load', e); setFailed(true); return; }
    setAiSentence(loadWeekSentence(db, start));
    if (!built.complete) return; // Daily Plus writes the sentence once the week is over
    ensureWeekSentence(db, start, now, liveDeps())
      .then((sentence) => { if (sentence && mine === token.current) setAiSentence(sentence); })
      .catch((e) => console.warn('daily: week sentence failed', e));
  }, [which]);
  useFocusEffect(load);

  // A stale view (the other segment's, or one that failed to reload) never shows under the selected segment.
  const ready = !!view && view.weekStart === startFor(which, Date.now());
  return (
    <SafeScreen tab>
    <ScrollView key={focusKey} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}>
      <Animated.View entering={rise(0)} style={s.header}><Text style={s.h1}>Your week</Text></Animated.View>

      <Animated.View entering={rise(1)} style={s.seg} accessibilityRole="tablist">
        {(['this', 'last'] as const).map((w) => (
          <Pressable key={w} onPress={() => setWhich(w)} accessibilityRole="tab" accessibilityState={{ selected: which === w }} style={[s.segBtn, which === w && s.segOn]}>
            <Text style={[s.segText, which === w && { color: C.ink }]}>{w === 'this' ? 'This week' : 'Last week'}</Text>
          </Pressable>
        ))}
      </Animated.View>

      {FEATURES.screenTime
        ? <IosWeekBody weekStart={startFor(which, Date.now())} aiSentence={aiSentence} />
        : ready && view ? <WeekBody view={view} aiSentence={aiSentence} /> : failed ? <Text style={s.muted}>Couldn't load this week.</Text> : null}
    </ScrollView>
    </SafeScreen>
  );
}

const s = StyleSheet.create({
  header: { height: 44, justifyContent: 'center' },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  seg: { flexDirection: 'row', backgroundColor: C.panel, borderRadius: 999, padding: 4 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.white },
  segText: { fontFamily: F.semi, fontSize: 13, color: C.muted },
  box: { backgroundColor: C.white, borderRadius: 20, padding: 16 },
  muted: { fontFamily: F.regular, fontSize: 13, color: C.muted },
  avgRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4, marginBottom: 14 },
  avg: { fontFamily: F.semi, fontSize: 30, letterSpacing: -0.6, color: C.ink },
  delta: { fontFamily: F.semi, fontSize: 13 },
  bars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: C.line, borderStyle: 'dashed', paddingTop: 10 },
  col: { alignItems: 'center', gap: 6 },
  bar: { width: 28, borderRadius: 9, overflow: 'hidden', justifyContent: 'flex-end' },
  barEmpty: { height: 6, backgroundColor: C.line },
  barToday: { borderWidth: 2, borderColor: C.ink },
  colLabel: { fontFamily: F.regular, fontSize: 11, color: C.muted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 3 },
  legendText: { fontFamily: F.regular, fontSize: 11, color: C.muted },
  sentence: { backgroundColor: '#BFEBD3', borderRadius: 22, paddingVertical: 16, paddingHorizontal: 18, gap: 8 },
  eyebrow: { fontFamily: F.semi, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(0,0,0,0.6)' },
  sentenceText: { fontFamily: F.regular, fontSize: 16, lineHeight: 22, color: C.ink },
  sentenceBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  sentenceBtnText: { fontFamily: F.semi, fontSize: 13, color: C.ink, textDecorationLine: 'underline' },
  small: { fontFamily: F.regular, fontSize: 12, color: 'rgba(0,0,0,0.6)' },
  app: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  appDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  appLetter: { fontFamily: F.semi, fontSize: 11, color: C.ink },
  appName: { width: 92, fontFamily: F.regular, fontSize: 13, color: C.ink },
  track: { flex: 1, height: 8, borderRadius: 99, backgroundColor: '#F5F1EC', overflow: 'hidden' },
  appMin: { width: 52, textAlign: 'right', fontFamily: F.semi, fontSize: 13, color: C.ink }
});
