import type { ReactNode } from 'react';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { C } from '../theme';

const TAB: Edge[] = ['top', 'left', 'right'];
const ALL: Edge[] = ['top', 'left', 'right', 'bottom'];

/** A page that never scrolls under the status bar, notch, camera cutout or gesture bar (padding inside a ScrollView
 * scrolls away with the content; this stays put). Tab pages leave the bottom to the tab bar. */
export function SafeScreen({ children, tab = false, color = C.bg }: { children: ReactNode; tab?: boolean; color?: string }) {
  return <SafeAreaView edges={tab ? TAB : ALL} style={{ flex: 1, backgroundColor: color }}>{children}</SafeAreaView>;
}
