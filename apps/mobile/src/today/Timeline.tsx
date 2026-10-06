import { Text, View } from 'react-native';
import { C, F } from '../theme';
import { CATEGORY_LOOK } from '../tracking/categories';
import type { TodayView } from './build';

export function Timeline({ view }: { view: TodayView }) {
  const t = view.timeline;
  return (
    <View style={{ backgroundColor: C.white, borderRadius: 18, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
      <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted, marginBottom: 8 }}>Today</Text>
      <View style={{ height: 26, borderRadius: 9, backgroundColor: '#F5F1EC', overflow: 'hidden' }}>
        {t.segments.map((seg, i) => (
          <View key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${seg.left}%`, width: `${Math.max(seg.width, 0.4)}%`, backgroundColor: CATEGORY_LOOK[seg.category].color }} />
        ))}
        {t.nowAt !== null && <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${t.nowAt}%`, width: 2, backgroundColor: C.ink }} />}
      </View>
      <View style={{ height: 16, marginTop: 6 }}>
        {t.ticks.map((tick) => (
          <Text key={tick.label} style={{ position: 'absolute', left: `${tick.at}%`, fontFamily: F.regular, fontSize: 11, color: C.muted }}>{tick.label}</Text>
        ))}
      </View>
    </View>
  );
}
