import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import { Icon, type IconName } from './icons';

const TAB_ICON: Record<string, IconName> = { index: 'home', report: 'report', week: 'week', reminders: 'bell' };

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} style={s.tab}>
            <View style={[s.pill, focused && s.pillOn]}>
              <Icon name={TAB_ICON[route.name] ?? 'home'} color={focused ? C.white : C.muted} />
            </View>
            <Text style={[s.label, focused && { color: C.ink }]}>{descriptors[route.key].options.title ?? route.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, paddingHorizontal: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 48, justifyContent: 'center' },
  pill: { width: 52, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.ink },
  label: { fontFamily: F.medium, fontSize: 11, color: C.muted }
});
