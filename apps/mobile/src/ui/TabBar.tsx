import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import { Icon, type IconName } from './icons';

const TAB_ICON: Record<string, IconName> = { index: 'home', report: 'report', week: 'week', reminders: 'bell' };

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8), paddingLeft: insets.left + 10, paddingRight: insets.right + 10 }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };
        return <Tab key={route.key} focused={focused} icon={TAB_ICON[route.name] ?? 'home'} label={descriptors[route.key].options.title ?? route.name} onPress={onPress} />;
      })}
    </View>
  );
}

/** Mockup motion: the selected tab's pill pops in (scale .5 → 1 with a little overshoot), and a tab dips to .95 while pressed. */
function Tab({ focused, icon, label, onPress }: { focused: boolean; icon: IconName; label: string; onPress: () => void }) {
  const still = useReducedMotion();
  const pop = useSharedValue(0);
  const press = useSharedValue(1);
  useEffect(() => {
    if (still) pop.value = focused ? 1 : 0;
    else if (focused) pop.value = withDelay(pop.value === 0 ? 120 : 0, withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 }));
    else pop.value = withTiming(0, { duration: 140 });
  }, [focused, still, pop]);
  const pill = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.value * 1.6), transform: [{ scale: 0.5 + 0.5 * pop.value }] }));
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <Pressable onPress={onPress} onPressIn={() => { if (!still) press.value = withTiming(0.95, { duration: 90 }); }}
      onPressOut={() => { press.value = still ? 1 : withSpring(1, { damping: 9, stiffness: 260 }); }}
      accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }} style={s.tab}>
      <Animated.View style={[s.inner, pressed]}>
        <View style={s.pill}>
          <Animated.View style={[StyleSheet.absoluteFill, s.pillOn, pill]} />
          <Icon name={icon} color={focused ? C.white : C.muted} />
        </View>
        <Text style={[s.label, focused && { color: C.ink }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  tab: { flex: 1, minHeight: 48, justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 4 },
  pill: { width: 52, height: 30, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.ink, borderRadius: 999 },
  label: { fontFamily: F.medium, fontSize: 11, color: C.muted }
});
