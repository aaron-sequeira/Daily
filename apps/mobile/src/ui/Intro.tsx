import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type SharedValue
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { C, F } from '../theme';

// The Logo.tsx artwork (100x100 box), split into layers so each part can move on its own.
const SUN = '#F6B35E', FACE = '#3A2412', INK = '#171717';
const RAYS = ['M19.01,48.92 Q13.78,46.51 8.74,44.59', 'M31.48,34.27 Q28.33,30.03 25.87,25.86', 'M50.03,29.24 Q49.51,23.88 50.04,18.51',
  'M67.62,34.54 Q71.02,29.32 74.51,23.81', 'M79.18,48.33 Q85.67,44.75 92.19,42.23'];
const HORIZON = 'M14,67 C17,66.58 26,64.5 32,64.5 C38,64.5 44,67 50,67 C56,67 62,64.58 68,64.5 C74,64.42 83,66.17 86,66.5';
const SIZE = 112; // = the Android 12 splash square (plugins/withSplashSquare.js), so the hand-over is invisible
const EXIT_AT = 1250;

/** Cold-start intro (~1.5 s), continuing the system splash: Sunny rises over the horizon, the rays pop out left to right,
 * the name fades up, then everything lifts away into the app. Tap to skip; with Remove animations it just fades. */
export function Intro({ start, onDone, onReady }: { start: boolean; onDone: () => void; onReady: () => void }) {
  const still = useReducedMotion();
  const rise = useSharedValue(still ? 1 : 0);
  const rays = [useSharedValue(still ? 1 : 0), useSharedValue(still ? 1 : 0), useSharedValue(still ? 1 : 0), useSharedValue(still ? 1 : 0), useSharedValue(still ? 1 : 0)];
  const words = useSharedValue(still ? 1 : 0);
  const out = useSharedValue(0);

  const leave = (delay: number) => {
    out.value = withDelay(delay, withTiming(1, { duration: still ? 250 : 380, easing: Easing.in(Easing.cubic) }, (done) => { if (done) runOnJS(onDone)(); }));
  };
  useEffect(() => {
    if (!start) return; // first frame only, while the fonts load
    if (still) { leave(500); return; }
    rise.value = withDelay(180, withSpring(1, { damping: 13, stiffness: 120 }));
    rays.forEach((r, i) => { r.value = withDelay(520 + i * 70, withSpring(1, { damping: 9, stiffness: 260 })); });
    words.value = withDelay(650, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    leave(EXIT_AT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const whole = useAnimatedStyle(() => ({ opacity: 1 - out.value, transform: [{ scale: 1 + out.value * 0.06 }] }));
  const sunStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - rise.value) * SIZE * 0.32 }] }));
  const wordsStyle = useAnimatedStyle(() => ({ opacity: words.value, transform: [{ translateY: (1 - words.value) * 14 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.root, whole]} pointerEvents="box-only">
      <Pressable style={s.center} onPress={() => { out.value = withTiming(1, { duration: 200 }, (d) => { if (d) runOnJS(onDone)(); }); }}
        accessibilityRole="button" accessibilityLabel="Daily. Tap to skip">
        {/* Same size and place as the system splash image (112 dp, centred), so the hand-over is invisible. */}
        <View style={s.square} onLayout={onReady}>
          {/* The sun rises from behind the horizon: clipped to the sky (top 64% of the box). */}
          <View style={s.sky}>
            <Animated.View style={sunStyle}>
              <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
                <Circle cx="50" cy="64" r="21" fill={SUN} />
                <Path d="M43.5 52 L43.5 54 M56.5 52 L56.5 54" stroke={FACE} strokeWidth={3.8} strokeLinecap="round" />
                <Path d="M44.8 57.6 Q50 61.4 55.2 57.6" stroke={FACE} strokeWidth={2.8} strokeLinecap="round" fill="none" />
              </Svg>
            </Animated.View>
          </View>
          {RAYS.map((d, i) => <Ray key={i} d={d} v={rays[i]} />)}
          <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Path d={HORIZON} stroke={C.bg} strokeWidth={6} strokeLinecap="round" fill="none" />
          </Svg>
        </View>
        {start && <Animated.View style={[s.words, wordsStyle]}>
          <Animated.Text style={s.name}>Daily</Animated.Text>
          <Animated.Text style={s.tag}>Your day, written.</Animated.Text>
        </Animated.View>}
      </Pressable>
    </Animated.View>
  );
}

function Ray({ d, v }: { d: string; v: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 1.4), transform: [{ scale: 0.7 + 0.3 * v.value }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100"><Path d={d} stroke={SUN} strokeWidth={7} strokeLinecap="round" fill="none" /></Svg>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: C.bg, zIndex: 100, elevation: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  square: { width: SIZE, height: SIZE, borderRadius: SIZE * 0.24, backgroundColor: INK, overflow: 'hidden' },
  sky: { position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE * 0.64, overflow: 'hidden' },
  words: { position: 'absolute', top: '50%', marginTop: SIZE / 2 + 26, left: 0, right: 0, alignItems: 'center' },
  name: { fontFamily: F.semi, fontSize: 34, letterSpacing: -0.5, color: C.ink },
  tag: { fontFamily: F.regular, fontSize: 15, color: C.muted, marginTop: 4 }
});
