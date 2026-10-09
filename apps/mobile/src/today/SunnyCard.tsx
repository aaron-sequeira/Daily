import { Text, View } from 'react-native';
import { FEATURES } from '../platformNow';
import { LOOK } from '../sunny/look';
import { MOOD_COPY, MOODS, moodIndex } from '../sunny/mood';
import { Sunny } from '../sunny/Sunny';
import { C, F } from '../theme';
import type { TodayView } from './build';
import { goalLine } from './copy';

export function SunnyCard({ view, access }: { view: TodayView; access: boolean }) {
  const current = moodIndex(view.mood);
  return (
    <View style={{ backgroundColor: C.white, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Sunny face={access ? view.mood : 'unknown'} size={76} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.ink }}>{access ? MOOD_COPY[view.mood].title : "Sunny can't see your day yet"}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 12, lineHeight: 17, color: C.muted, marginTop: 3 }}>
          {access ? `${goalLine(view.leftMin, view.goalMin)} · ${view.pickups} ${view.pickups === 1 ? 'pickup' : 'pickups'}` : FEATURES.usageAccess ? 'Turn on usage access so he can.' : 'Screen Time is coming to Daily on iPhone. Reminders, breaks and water work as normal.'}
        </Text>
        {access && (
          <View accessible accessibilityLabel={`Mood ${current + 1} of 5`} style={{ flexDirection: 'row', gap: 4, marginTop: 9 }}>
            {MOODS.map((m, i) => (
              <View key={m} style={{ flex: 1, height: 6, borderRadius: 9, backgroundColor: LOOK[m].body, opacity: i === current ? 1 : 0.35 }} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
