import { router } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DailyNative from '../../modules/daily-native';
import { C, F } from '../../src/theme';
import { Icon } from '../../src/ui/icons';

const TIPS: { brands: string[]; name: string; steps: string[] }[] = [
  { brands: ['realme', 'oppo', 'oneplus'], name: 'Realme, OPPO and OnePlus', steps: ['Settings → Battery → More settings → turn off "Optimise battery use" for Daily.', 'Settings → Apps → Daily → Battery usage → allow background activity and auto launch.', 'In the recent-apps screen, pull Daily down to lock it.'] },
  { brands: ['xiaomi', 'redmi', 'poco'], name: 'Xiaomi, Redmi and POCO', steps: ['Settings → Apps → Daily → Battery saver → No restrictions.', 'Settings → Apps → Daily → Autostart → on.', 'Lock Daily in the recent-apps screen.'] },
  { brands: ['samsung'], name: 'Samsung', steps: ['Settings → Apps → Daily → Battery → Unrestricted.', 'Settings → Battery → Background usage limits → make sure Daily is not in "Sleeping apps".'] },
  { brands: [], name: 'Other phones', steps: ['Settings → Apps → Daily → Battery → allow background use / Unrestricted.', 'Turn off battery optimisation for Daily.'] }
];

function brand(): string {
  return String((Platform.constants as { Brand?: string }).Brand ?? '').toLowerCase();
}

export default function KeepRunning() {
  const insets = useSafeAreaInsets();
  const b = brand();
  const mine = TIPS.find((t) => t.brands.includes(b)) ?? TIPS[TIPS.length - 1];
  const others = TIPS.filter((t) => t !== mine);
  const open = (fn: () => unknown) => { try { fn(); } catch (e) { console.warn('daily: opening settings failed', e); } };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 14 }}>
      <View style={s.head}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={s.round}><Icon name="back" size={18} /></Pressable>
        <Text style={s.h1}>Keep Sunny running</Text>
      </View>
      <Text style={s.p}>Some phones close apps in the background to save battery. If Sunny’s notification disappears or reminders arrive late, change these settings.</Text>
      <View style={s.card}>
        <Text style={s.cardTitle}>{mine.name}</Text>
        {mine.steps.map((step, i) => <Text key={i} style={s.step}>{i + 1}. {step}</Text>)}
      </View>
      <Pressable onPress={() => open(() => DailyNative.openBatterySettings())} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>Open battery settings</Text></Pressable>
      <Pressable onPress={() => open(() => Linking.openSettings())} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>Open Daily’s app settings</Text></Pressable>
      {others.map((t) => (
        <View key={t.name} style={s.card}>
          <Text style={s.cardTitle}>{t.name}</Text>
          {t.steps.map((step, i) => <Text key={i} style={s.step}>{i + 1}. {step}</Text>)}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  p: { fontFamily: F.regular, fontSize: 14, lineHeight: 21, color: C.body },
  card: { backgroundColor: C.white, borderRadius: 20, padding: 16, gap: 8 },
  cardTitle: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  step: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.body },
  primary: { minHeight: 52, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 15, color: C.white },
  secondary: { minHeight: 48, borderRadius: 999, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: F.semi, fontSize: 14, color: C.ink }
});
