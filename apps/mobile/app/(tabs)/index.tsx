import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import DailyNative from '../../modules/daily-native';
import { formatDuration } from '../../src/format';
import { ScreenTimeReport } from '../../modules/daily-native/screenTime';
import { getDb } from '../../src/db/expoDb';
import { FEATURES } from '../../src/platformNow';
import { setUpScreenTime } from '../../src/screentime/live';
import { C, F } from '../../src/theme';
import { CategoryCard } from '../../src/today/CategoryCard';
import { dateLine, greeting } from '../../src/today/copy';
import { SunnyCard } from '../../src/today/SunnyCard';
import { Timeline } from '../../src/today/Timeline';
import { useToday } from '../../src/today/useToday';
import { CATEGORY_LOOK, type Category } from '../../src/tracking/categories';
import { Icon } from '../../src/ui/icons';
import { Logo } from '../../src/ui/Logo';
import { rise, useFocusKey } from '../../src/ui/motion';
import { SafeScreen } from '../../src/ui/SafeScreen';

export default function Today() {
  const focusKey = useFocusKey();
  const { view, access, refresh } = useToday();
  const [settingUp, setSettingUp] = useState(false);
  const turnOnScreenTime = () => {
    setSettingUp(true);
    setUpScreenTime(getDb()).finally(() => { setSettingUp(false); void refresh(); });
  };
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const active = view && (filter === 'all' || view.categories.some((c) => c.id === filter)) ? filter : 'all';
  if (!view) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const shown = active === 'all' ? view.categories : view.categories.filter((c) => c.id === active);
  const now = Date.now();

  return (
    <SafeScreen tab>
    <ScrollView key={focusKey} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 24 }}>
      <Animated.View entering={rise(0)} style={s.header}>
        <Logo size={30} />
        <Text style={s.brand}>Daily</Text>
        <View style={s.status}>
          <View style={[s.dot, !access && { backgroundColor: '#C9C2BB' }]} />
          <Text style={s.statusText}>{access ? 'Tracking' : 'Paused'}</Text>
        </View>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" style={s.round}><Icon name="gear" size={19} /></Pressable>
        </Link>
      </Animated.View>

      <Animated.Text entering={rise(1)} style={s.date}>{greeting(now)} · {dateLine(now, view.firstPickupMs)}</Animated.Text>
      {/* iPhone: Apple's Screen Time report (drawn by the ScreenTimeReport extension) replaces the per-app sections. */}
      {FEATURES.screenTime && (access && ScreenTimeReport ? (
        <>
          <Animated.View entering={rise(2)} style={[s.panel, { marginBottom: 18 }]}><SunnyCard view={view} access={access} /></Animated.View>
          <Animated.View entering={rise(3)}><ScreenTimeReport context="today" style={{ height: 820 }} /></Animated.View>
        </>
      ) : (
        <Animated.View entering={rise(2)} style={[s.banner, { marginTop: 8 }]}>
          <Text style={s.bannerTitle}>See your Screen Time</Text>
          <Text style={s.bannerBody}>Daily shows your iPhone's Screen Time here and Sunny follows it. Apple asks once. Your Screen Time stays on this phone.</Text>
          <Pressable onPress={turnOnScreenTime} disabled={settingUp} accessibilityRole="button" style={[s.bannerBtn, settingUp && { opacity: 0.5 }]}><Text style={s.bannerBtnText}>Turn on Screen Time</Text></Pressable>
        </Animated.View>
      ))}
      {FEATURES.usageAccess && (<>
      <Animated.Text entering={rise(2)} style={s.headline}>
        You spent <Text style={{ fontFamily: F.semi }}>{formatDuration(view.phoneMin)}</Text> on your phone today
      </Animated.Text>

      {!access && (
        <Animated.View entering={rise(3)} style={s.banner}>
          <Text style={s.bannerTitle}>Turn on usage access</Text>
          <Text style={s.bannerBody}>Daily needs it to see which apps you use. Only app names and minutes, kept on this phone.</Text>
          <Pressable onPress={() => DailyNative.openUsageAccessSettings()} accessibilityRole="button" accessibilityLabel="Open usage access settings" style={s.bannerBtn}><Text style={s.bannerBtnText}>Open settings</Text></Pressable>
        </Animated.View>
      )}

      {view.categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginBottom: 20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {(['all', ...view.categories.map((c) => c.id)] as const).map((id, i) => {
            const on = active === id;
            return (
              <Animated.View key={id} entering={rise(3 + i)}>
                <Pressable onPress={() => setFilter(id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.pill, on && { backgroundColor: C.ink }]}>
                  <View style={[s.pillIco, on && { backgroundColor: C.white, borderWidth: 0 }]}><Icon name={id === 'all' ? 'grid' : id} size={15} /></View>
                  <Text style={[s.pillText, on && { color: C.white }]}>{id === 'all' ? 'All' : CATEGORY_LOOK[id].label}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {view.empty && access ? (
        <Animated.View entering={rise(4)} style={s.empty}><Text style={s.emptyText}>Nothing yet today. Sunny's ready when you are.</Text></Animated.View>
      ) : (
        <>
          {shown.length > 0 && <Animated.Text entering={rise(4)} style={s.sec}>Where your time went</Animated.Text>}
          <View style={s.grid}>{shown.map((c, i) => <CategoryCard key={c.id} cat={c} index={i} />)}</View>
          {active !== 'all' && shown[0] && (
            <View style={s.list}>
              {shown[0].apps.map((a) => (
                <View key={a.pkg} style={s.row}><Text style={s.rowLabel}>{a.label}</Text><Text style={s.rowMin}>{formatDuration(a.minutes)}</Text></View>
              ))}
            </View>
          )}
        </>
      )}

      </>)}

      {/* iPhone with Screen Time shows Sunny above the report instead */}
      {!(FEATURES.screenTime && access) && <Animated.View entering={rise(9)} style={s.panel}>
        <SunnyCard view={view} access={access} />
        {FEATURES.usageAccess && <Timeline view={view} />}
      </Animated.View>}
    </ScrollView>
    </SafeScreen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44 },
  brand: { fontFamily: F.semi, fontSize: 16, color: C.ink },
  status: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ok },
  statusText: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  date: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 14, marginBottom: 6 },
  headline: { fontFamily: F.regular, fontSize: 38, lineHeight: 40, letterSpacing: -0.9, color: C.ink, marginBottom: 18 },
  banner: { backgroundColor: C.white, borderRadius: 20, padding: 16, gap: 8, marginBottom: 18 },
  bannerTitle: { fontFamily: F.semi, fontSize: 16, color: C.ink },
  bannerBody: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.body },
  bannerBtn: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.ink, justifyContent: 'center' },
  bannerBtnText: { fontFamily: F.semi, fontSize: 14, color: C.white },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingLeft: 5, paddingRight: 16, borderRadius: 999, backgroundColor: C.white, minHeight: 44 },
  pillIco: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: F.medium, fontSize: 13, color: C.ink },
  sec: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginBottom: 14 },
  list: { backgroundColor: C.white, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, alignItems: 'center' },
  rowLabel: { fontFamily: F.regular, fontSize: 14, color: C.ink },
  rowMin: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  empty: { backgroundColor: C.white, borderRadius: 22, padding: 24, marginBottom: 14 },
  emptyText: { fontFamily: F.regular, fontSize: 14, color: C.muted },
  panel: { backgroundColor: C.panel, borderRadius: 22, padding: 10, gap: 10 }
});
