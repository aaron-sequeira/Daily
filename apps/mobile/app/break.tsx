import { Text, View } from 'react-native';
import { C, F } from '../src/theme';

// Placeholder until the real screen replaces it.
export default function BreakPlaceholder() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.semi, fontSize: 22, color: C.ink }}>Break</Text>
    </View>
  );
}
