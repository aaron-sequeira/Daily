import { File, Paths } from 'expo-file-system';
import { Link, router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDb } from '../../src/db/expoDb';
import { getNumber, setSetting } from '../../src/db/settings';
import { deleteEverything, exportJson, RETENTION_CHOICES, seedSampleDay } from '../../src/settings/data';
import { Sunny } from '../../src/sunny/Sunny';
import { C, F } from '../../src/theme';
import { GoalStepper } from '../../src/ui/GoalStepper';
import { Icon } from '../../src/ui/icons';
import { rise } from '../../src/ui/motion';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const db = getDb();
  const [goal, setGoal] = useState(() => getNumber(db, 'goal_min'));
  const [retention, setRetention] = useState(() => getNumber(db, 'retention_days'));

  const changeGoal = (min: number) => { setGoal(min); setSetting(db, 'goal_min', min); };
  const cycleRetention = () => {
    const next = RETENTION_CHOICES[(RETENTION_CHOICES.indexOf(retention as (typeof RETENTION_CHOICES)[number]) + 1) % RETENTION_CHOICES.length];
    setRetention(next);
    setSetting(db, 'retention_days', next);
  };
  const exportData = async () => {
    const file = new File(Paths.cache, 'daily-export.json');
    file.write(exportJson(db));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  };
  const confirmDelete = () => Alert.alert('Delete everything?', 'This removes all of Daily’s history from this phone. It can’t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { deleteEverything(db); router.replace('/onboarding'); } }
  ]);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
      <Animated.View entering={rise(0)} style={s.head}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back to Today" style={s.round}><Icon name="back" size={18} /></Pressable>
        <Text style={s.h1}>Settings</Text>
      </Animated.View>

      <Group i={1} label="Goals">
        <View style={s.row}><Sunny face="happy" size={30} /><Text style={s.rowText}>Your buddy</Text><Text style={s.value}>Sunny · more soon</Text></View>
        <View style={[s.row, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 12, gap: 10 }]}>
          <Text style={s.rowText}>Daily phone goal</Text>
          <GoalStepper value={goal} onChange={changeGoal} />
        </View>
      </Group>

      <Group i={2} label="Privacy">
        <Link href="/settings/categories" asChild><Pressable style={s.row}><Text style={s.rowText}>App categories</Text><Text style={s.value}>Edit</Text></Pressable></Link>
        <Pressable onPress={cycleRetention} style={s.row}><Text style={s.rowText}>Keep history for</Text><Text style={s.value}>{retention} days</Text></Pressable>
        <Pressable onPress={exportData} style={s.row}><Text style={s.rowText}>Export my data</Text></Pressable>
        <Pressable onPress={confirmDelete} style={s.row}><Text style={[s.rowText, { color: C.danger }]}>Delete everything</Text></Pressable>
      </Group>

      {__DEV__ && (
        <Group i={3} label="Developer">
          <Pressable onPress={() => { seedSampleDay(db, Date.now()); router.back(); }} style={s.row}><Text style={s.rowText}>Seed a sample day</Text></Pressable>
          <Link href="/dev/sunny" asChild><Pressable style={s.row}><Text style={s.rowText}>Sunny gallery</Text></Pressable></Link>
        </Group>
      )}

      <Text style={s.note}>Everything Daily records stays on this phone: app names, minutes and unlock times. Never notifications, messages or what's on your screen.</Text>
    </ScrollView>
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
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  label: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 14, marginBottom: 6, marginLeft: 2 },
  group: { backgroundColor: C.white, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F0E9E3' },
  rowText: { fontFamily: F.regular, fontSize: 14, color: C.ink },
  value: { marginLeft: 'auto', fontFamily: F.regular, fontSize: 13, color: C.muted },
  note: { fontFamily: F.regular, fontSize: 12, lineHeight: 18, color: C.muted, marginTop: 16, marginHorizontal: 2 }
});
