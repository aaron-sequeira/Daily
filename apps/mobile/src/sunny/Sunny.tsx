import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, LayoutAnimationConfig, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { F } from '../theme';
import { LOOK, raysPath, type SunnyFace } from './look';

const INK = '#3A2412';
const box = '0 0 120 120';
const fill = StyleSheet.absoluteFill;
const LABEL: Record<SunnyFace, string> = {
  glowing: 'Sunny is glowing', happy: 'Sunny is happy', alright: 'Sunny is alright', fading: 'Sunny is fading', sad: 'Sunny is sad', unknown: "Sunny can't see your day yet"
};

export function Sunny({ face, size }: { face: SunnyFace; size: number }) {
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={LABEL[face]}>
      {/* Mood changes cross-fade. When the whole Sunny goes away (a tab re-plays its entrance by rebuilding its page),
          no fade-out: Reanimated would keep the old face and its card on screen over the new page until it ended. */}
      <LayoutAnimationConfig skipExiting>
        <Animated.View key={face} entering={FadeIn.duration(600)} exiting={FadeOut.duration(300)} style={fill}>
          <Face face={face} size={size} />
        </Animated.View>
      </LayoutAnimationConfig>
    </View>
  );
}

function loop(sv: { value: number }, to: number, ms: number) {
  sv.value = withRepeat(withSequence(withTiming(to, { duration: ms, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: ms, easing: Easing.inOut(Easing.sin) })), -1);
}

function Face({ face, size }: { face: SunnyFace; size: number }) {
  const L = LOOK[face];
  const reduced = useReducedMotion();
  const unit = size / 120;
  const spin = useSharedValue(0);
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);
  const glow = useSharedValue(0);
  const drip = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    if (L.spinSec > 0) spin.value = withRepeat(withTiming(360, { duration: L.spinSec * 1000, easing: Easing.linear }), -1);
    loop(bob, L.bob * unit, L.bobSec * 500);
    blink.value = withRepeat(withSequence(withDelay(4400, withTiming(0.1, { duration: 110 })), withTiming(1, { duration: 110 })), -1);
    loop(glow, 1, 1500);
    if (L.tear) loop(drip, 7 * unit, 1600);
    if (L.cloud) loop(drift, -5 * unit, 3500);
  }, [reduced, L, unit, spin, bob, blink, glow, drip, drift]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: L.glow[0] + (L.glow[1] - L.glow[0]) * glow.value }));
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const tearStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drip.value }] }));
  const cloudStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drift.value }] }));

  return (
    <>
      <Animated.View style={[fill, glowStyle]}>
        <Svg width="100%" height="100%" viewBox={box}><Circle cx="60" cy="60" r="52" fill={L.body} /></Svg>
      </Animated.View>
      {L.sparkle && (
        <Svg style={fill} width="100%" height="100%" viewBox={box}>
          <Path d="M14 14 L16 20 L22 22 L16 24 L14 30 L12 24 L6 22 L12 20 Z M104 92 L105.5 96.5 L110 98 L105.5 99.5 L104 104 L102.5 99.5 L98 98 L102.5 96.5 Z" fill="#FFC861" />
        </Svg>
      )}
      <Animated.View style={[fill, bobStyle]}>
        <Animated.View style={[fill, spinStyle]}>
          <Svg width="100%" height="100%" viewBox={box}><Path d={raysPath(L.rays, L.rayLen)} stroke={L.edge} strokeWidth={5.5} strokeLinecap="round" fill="none" /></Svg>
        </Animated.View>
        <Svg style={fill} width="100%" height="100%" viewBox={box}>
          <Circle cx="60" cy="60" r="33" fill={L.body} stroke={L.edge} strokeWidth={3} />
          <Ellipse cx="40" cy="65" rx="6" ry="3.5" fill="#F2836B" opacity={L.cheek} />
          <Ellipse cx="80" cy="65" rx="6" ry="3.5" fill="#F2836B" opacity={L.cheek} />
          {L.brows !== '' && <Path d={L.brows} stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none" />}
          <Path d={L.mouth} stroke={INK} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill={L.mouthFill} />
        </Svg>
        <Animated.View style={[fill, eyeStyle, { transformOrigin: '50% 45%' }]}>
          <Svg width="100%" height="100%" viewBox={box}><Path d={L.eyes} stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>
        </Animated.View>
        {L.tear && (
          <Animated.View style={[fill, tearStyle]}>
            <Svg width="100%" height="100%" viewBox={box}><Path d="M44 61 Q41.4 66.5 44 68.5 Q46.6 66.5 44 61 Z" fill="#7DB8EE" /></Svg>
          </Animated.View>
        )}
      </Animated.View>
      {L.cloud && (
        <Animated.View style={[fill, cloudStyle]}>
          <Svg width="100%" height="100%" viewBox={box}><Path d="M70 46 a9 9 0 0 1 4 -17 a12 12 0 0 1 22 1 a8.5 8.5 0 0 1 3 16 z" fill="#F3EEE8" stroke="#B9AFA4" strokeWidth={2} strokeLinejoin="round" /></Svg>
        </Animated.View>
      )}
      {L.question && (
        <Text style={{ position: 'absolute', right: size * 0.12, top: size * 0.08, fontFamily: F.semi, fontSize: size * 0.22, color: '#A99A85' }}>?</Text>
      )}
    </>
  );
}
