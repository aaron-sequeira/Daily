import { FadeInDown } from 'react-native-reanimated';
import { EASE } from '../theme';

/** Staggered rise-in for the n-th block on a screen. Turns itself off when Android's "Remove animations" is on. */
export function rise(index: number) {
  return FadeInDown.duration(700).delay(index * 60).easing(EASE);
}
