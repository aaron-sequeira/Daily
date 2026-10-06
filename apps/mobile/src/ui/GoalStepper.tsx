import { Pressable, Text, View } from 'react-native';
import { formatDuration } from '../format';
import { C, F } from '../theme';
import { Icon } from './icons';

export const GOAL_MIN = 60;
export const GOAL_MAX = 720;

export function GoalStepper({ value, onChange }: { value: number; onChange: (min: number) => void }) {
  const step = (d: number) => onChange(Math.min(GOAL_MAX, Math.max(GOAL_MIN, value + d)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Pressable onPress={() => step(-30)} disabled={value <= GOAL_MIN} accessibilityLabel="Less" style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', opacity: value <= GOAL_MIN ? 0.4 : 1 }}>
        <Icon name="minus" size={20} />
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.semi, fontSize: 34, color: C.ink, minWidth: 110, textAlign: 'center' }}>{formatDuration(value)}</Text>
      <Pressable onPress={() => step(30)} disabled={value >= GOAL_MAX} accessibilityLabel="More" style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', opacity: value >= GOAL_MAX ? 0.4 : 1 }}>
        <Icon name="plus" size={20} />
      </Pressable>
    </View>
  );
}
