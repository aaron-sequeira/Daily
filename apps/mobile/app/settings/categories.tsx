import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDb } from '../../src/db/expoDb';
import { appsForSettings, setUserCategory } from '../../src/settings/data';
import { C, F } from '../../src/theme';
import { CATEGORIES, CATEGORY_LOOK } from '../../src/tracking/categories';
import { Icon } from '../../src/ui/icons';

export default function Categories() {
  const insets = useSafeAreaInsets();
  const db = getDb();
  const [apps, setApps] = useState(() => appsForSettings(db));

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10 }}
      data={apps}
      keyExtractor={(a) => a.package}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, marginBottom: 6 }}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}><Icon name="back" size={18} /></Pressable>
          <Text style={{ fontFamily: F.semi, fontSize: 22, color: C.ink }}>App categories</Text>
        </View>
      }
      ListEmptyComponent={<Text style={{ fontFamily: F.regular, color: C.muted }}>Apps appear here once Daily has seen you use them.</Text>}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: C.white, borderRadius: 18, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink, flex: 1 }}>{item.label}</Text>
            {item.overridden && (
              <Pressable onPress={() => { setUserCategory(db, item.package, null); setApps(appsForSettings(db)); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.muted }}>Reset</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map((c) => {
              const on = item.category === c;
              return (
                <Pressable key={c} onPress={() => { setUserCategory(db, item.package, c); setApps(appsForSettings(db)); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? C.ink : CATEGORY_LOOK[c].color }}>
                  <Text style={{ fontFamily: F.medium, fontSize: 12, color: on ? C.white : C.ink }}>{CATEGORY_LOOK[c].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    />
  );
}
