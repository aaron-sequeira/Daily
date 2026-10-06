import { Easing } from 'react-native-reanimated';

export const C = {
  bg: '#FBF8F4', panel: '#F2EBE6', ink: '#171717', muted: '#77716C', line: '#E7DFD8', white: '#FFFFFF',
  body: '#4A4541', ok: '#34C38F', danger: '#B3261E'
} as const;

export const F = { regular: 'DMSans_400Regular', medium: 'DMSans_500Medium', semi: 'DMSans_600SemiBold' } as const;

export const EASE = Easing.bezier(0.22, 0.8, 0.26, 1);
export const SPRING_PRESS = { damping: 14, stiffness: 260 } as const;
