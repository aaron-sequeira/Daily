import { Pressable, Text, View } from 'react-native';
import { C, F } from '../theme';

export function FatalScreen({ error, onExport, onReset }: { error: string; onExport: () => void; onReset: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 24, color: C.ink, fontWeight: '600' }}>Something went wrong</Text>
      <Text style={{ fontSize: 14, color: C.body }}>Daily couldn't open its data. You can save a copy, then start fresh.</Text>
      <Text style={{ fontSize: 12, color: C.muted }}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={onExport}style={{ minHeight: 48, borderRadius: 999, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.ink, fontFamily: F.semi }}>Save a copy</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onReset}style={{ minHeight: 48, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.white, fontFamily: F.semi }}>Start fresh</Text>
      </Pressable>
    </View>
  );
}
