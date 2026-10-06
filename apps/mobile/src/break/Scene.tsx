import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { MobileAnimation } from '../reminders/defaults';

const box = '0 0 120 120';
const fill = StyleSheet.absoluteFill;
const ink = { stroke: '#171717', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
const BOTTLE = 'M51,24 h18 q0,5 7,9 q9,6 9,17 v48 q0,9 -9,9 h-32 q-9,0 -9,-9 v-48 q0,-11 9,-17 q7,-4 7,-9 z';

function useLoop(ms: number): SharedValue<number> {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const ease = { duration: ms, easing: Easing.inOut(Easing.sin) };
    v.value = withRepeat(withSequence(withTiming(1, ease), withTiming(0, ease)), -1);
  }, [reduced, ms, v]);
  return v;
}

function Layer({ style, children }: { style?: object; children: ReactNode }) {
  return (
    <Animated.View style={[fill, style]}>
      <Svg width="100%" height="100%" viewBox={box}>{children}</Svg>
    </Animated.View>
  );
}

const steam = (xs: number[], y: number) => xs.map((x) => <Path key={x} d={`M${x},${y} q-5,-6 0,-12 t0,-12`} {...ink} />);

function Water({ u }: { u: number }) {
  const tilt = useLoop(1800);
  const rise = useLoop(2200);
  const bottle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-4 + 8 * tilt.value}deg` }] }));
  const bubbles = useAnimatedStyle(() => ({ transform: [{ translateY: -24 * u * rise.value }], opacity: 1 - 0.8 * rise.value }));
  return (
    <Animated.View style={[fill, bottle]}>
      <Layer>
        <Defs><ClipPath id="bottle"><Path d={BOTTLE} /></ClipPath></Defs>
        <G clipPath="url(#bottle)">
          <Rect x="20" y="52" width="90" height="70" fill="#CFE6FB" />
          <Path d="M20,52 q6,-4 12,0 t12,0 t12,0 t12,0 t12,0 t12,0 t12,0" fill="#CFE6FB" stroke="#8EC3EE" strokeWidth={2} />
        </G>
        <Path d={BOTTLE} {...ink} />
        <Rect x="49" y="13" width="22" height="10" rx="3" fill="#171717" />
      </Layer>
      <Layer style={bubbles}>
        <Circle cx="52" cy="98" r="2.6" fill="#fff" /><Circle cx="64" cy="102" r="2" fill="#fff" /><Circle cx="58" cy="100" r="3" fill="#fff" />
      </Layer>
    </Animated.View>
  );
}

function Meal({ u }: { u: number }) {
  const puff = useLoop(1400);
  const chop = useLoop(900);
  const steamStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * u * puff.value }], opacity: 0.35 + 0.65 * (1 - puff.value) }));
  const chopStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-8 + 16 * chop.value}deg` }] }));
  return (
    <>
      <Layer style={steamStyle}>{steam([44, 60, 76], 48)}</Layer>
      <Layer>
        <Path d="M16,62 h88 q-4,36 -44,36 q-40,0 -44,-36 z" fill="#F9DDB9" />
        <Path d="M30,62 q5,-7 10,0 t10,0 t10,0 t10,0 t10,0 t10,0" {...ink} stroke="#E0A458" />
        <Path d="M16,62 h88 q-4,36 -44,36 q-40,0 -44,-36 z" {...ink} /><Path d="M42,98 h36" {...ink} />
      </Layer>
      <Layer style={[chopStyle, { transformOrigin: '60% 37%' }]}>
        <Path d="M84,26 L54,60" {...ink} strokeWidth={4} /><Path d="M92,30 L60,62" {...ink} strokeWidth={4} />
      </Layer>
    </>
  );
}

function Tea({ u }: { u: number }) {
  const puff = useLoop(1500);
  const dip = useLoop(1100);
  const steamStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * u * puff.value }], opacity: 0.35 + 0.65 * (1 - puff.value) }));
  const bagStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 5 * u * dip.value }] }));
  return (
    <>
      <Layer style={steamStyle}>{steam([46, 58], 42)}</Layer>
      <Layer style={bagStyle}>
        <Path d="M62,50 L70,26" {...ink} strokeWidth={2} />
        <Rect x="65" y="16" width="12" height="11" rx="2" fill="#F4C6C8" stroke="#171717" strokeWidth={2.4} />
      </Layer>
      <Layer>
        <Ellipse cx="56" cy="98" rx="40" ry="6" fill="#E9E3DD" /><Path d="M18,98 q38,10 76,0" {...ink} />
        <Path d="M28,52 h56 v16 q0,24 -28,24 q-28,0 -28,-24 z" fill="#BFEBD3" />
        <Path d="M28,52 h56 v16 q0,24 -28,24 q-28,0 -28,-24 z" {...ink} />
        <Path d="M84,58 q14,0 14,11 q0,11 -14,11" {...ink} />
      </Layer>
    </>
  );
}

function Dinner({ u }: { u: number }) {
  const puff = useLoop(1500);
  const wave = useLoop(800);
  const steamStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * u * puff.value }], opacity: 0.35 + 0.65 * (1 - puff.value) }));
  const forkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * u * wave.value }] }));
  const knifeStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 3 * u * wave.value }] }));
  return (
    <>
      <Layer style={steamStyle}>{steam([52, 66], 52)}</Layer>
      <Layer>
        <Ellipse cx="60" cy="78" rx="40" ry="14" fill="#E9E3DD" /><Ellipse cx="60" cy="78" rx="40" ry="14" {...ink} />
        <Ellipse cx="60" cy="76" rx="22" ry="7" fill="#F4C6C8" /><Path d="M50,74 q10,-6 20,0" {...ink} stroke="#D98C90" />
      </Layer>
      <Layer style={forkStyle}><Path d="M10,58 v34" {...ink} /><Path d="M5,58 v10 q5,7 10,0 v-10" {...ink} /></Layer>
      <Layer style={knifeStyle}><Path d="M110,58 v34" {...ink} /><Path d="M110,58 q-8,7 0,18 z" fill="#171717" /></Layer>
    </>
  );
}

function Stretch({ u }: { u: number }) {
  const reach = useLoop(1200);
  const left = useAnimatedStyle(() => ({ transform: [{ rotate: `${45 * reach.value}deg` }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ rotate: `${-45 * reach.value}deg` }] }));
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * u * reach.value }] }));
  const shoulder = { transformOrigin: '50% 38.3%' };
  return (
    <>
      <Layer><Path d="M30,102 h60" {...ink} stroke="#BFEBD3" strokeWidth={5} /><Path d="M60,72 l-12,28 M60,72 l12,28" {...ink} /></Layer>
      <Animated.View style={[fill, body]}>
        <Layer><Circle cx="60" cy="30" r="8" {...ink} fill="#F9DDB9" /><Path d="M60,38 v34" {...ink} /></Layer>
        <Layer style={[left, shoulder]}><Path d="M60,46 l-20,-14" {...ink} /></Layer>
        <Layer style={[right, shoulder]}><Path d="M60,46 l20,-14" {...ink} /></Layer>
      </Animated.View>
    </>
  );
}

const SCENES: Record<MobileAnimation, (p: { u: number }) => ReactNode> = { water: Water, meal: Meal, tea: Tea, dinner: Dinner, stretch: Stretch };

export function Scene({ kind, size }: { kind: MobileAnimation; size: number }) {
  const Draw = SCENES[kind];
  return <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Draw u={size / 120} /></View>;
}
