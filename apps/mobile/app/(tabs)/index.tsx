import { Text, View } from 'react-native';
import { C, F } from '../../src/theme';
import { Logo } from '../../src/ui/Logo';

export default function Today() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Logo size={64} />
      <Text style={{ fontFamily: F.semi, fontSize: 28, color: C.ink }}>Daily</Text>
    </View>
  );
}
