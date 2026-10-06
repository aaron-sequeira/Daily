import { Image, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { formatDuration } from '../format';
import { C, F } from '../theme';
import { CATEGORY_LOOK } from '../tracking/categories';
import { Icon } from '../ui/icons';
import { rise } from '../ui/motion';
import type { TodayCategory } from './build';

export function CategoryCard({ cat, index }: { cat: TodayCategory; index: number }) {
  const look = CATEGORY_LOOK[cat.id];
  const top = cat.apps.slice(0, 2);
  return (
    <Animated.View entering={rise(5 + index)} style={[s.card, { backgroundColor: look.color }]}>
      <View style={s.top}>
        <View style={s.ico}><Icon name={cat.id} size={15} /></View>
        <Text style={s.small}>{look.label}</Text>
        <Text style={s.chip}>{formatDuration(cat.minutes)}</Text>
      </View>
      <Text style={s.title} numberOfLines={2}>{top.map((a) => a.label).join(' & ')}</Text>
      <View style={s.foot}>
        <Text style={s.share}>{Math.round(cat.share * 100)}% of today</Text>
        <View style={{ flexDirection: 'row' }}>
          {top.map((a, i) => (
            <View key={a.pkg} style={[s.badge, { marginLeft: i === 0 ? 0 : -6 }]}>
              {a.icon
                ? <Image source={{ uri: `data:image/png;base64,${a.icon}` }} style={{ width: 16, height: 16 }} accessibilityIgnoresInvertColors />
                : <Text style={s.badgeText}>{a.label.charAt(0).toUpperCase()}</Text>}
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: { width: '48.5%', borderRadius: 22, padding: 14, minHeight: 132 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ico: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  small: { fontFamily: F.regular, fontSize: 12, color: C.ink },
  chip: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, fontFamily: F.semi, fontSize: 12, color: C.ink, overflow: 'hidden' },
  title: { fontFamily: F.medium, fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 'auto', paddingTop: 12 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 },
  share: { fontFamily: F.regular, fontSize: 11, color: 'rgba(0,0,0,0.62)' },
  badge: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badgeText: { fontFamily: F.semi, fontSize: 9, color: C.ink }
});
