import { ScrollView, Text, View } from 'react-native';
import { Sunny } from '../../src/sunny/Sunny';
import type { SunnyFace } from '../../src/sunny/look';
import { C, F } from '../../src/theme';

const FACES: SunnyFace[] = ['glowing', 'happy', 'alright', 'fading', 'sad', 'unknown'];

export default function SunnyGallery() {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, gap: 18 }}>
      {FACES.map((f) => (
        <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Sunny face={f} size={120} />
          <Sunny face={f} size={28} />
          <Text style={{ fontFamily: F.medium, color: C.ink }}>{f}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
