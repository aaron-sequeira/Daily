import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FadeInDown } from 'react-native-reanimated';
import { EASE } from '../theme';

/** Staggered rise-in for the n-th block on a screen. Turns itself off when Android's "Remove animations" is on. */
export function rise(index: number) {
  return FadeInDown.duration(700).delay(index * 60).easing(EASE);
}

/** Tab pages stay mounted, so their entrance animations would only play the first time. Use this as the `key` of the
 * page's content: it changes each time the tab is opened again, so the rise-ins replay (state above the key stays). */
export function useFocusKey(): number {
  const [key, setKey] = useState(0);
  const seen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (seen.current) setKey((k) => k + 1);
    seen.current = true;
  }, []));
  return key;
}
