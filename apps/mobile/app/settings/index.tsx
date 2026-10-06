import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../src/theme';
import { Icon } from '../../src/ui/icons';

// Placeholder; Task 13 replaces this with the real settings screen.
export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 12, paddingHorizontal: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 44 }}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="back" size={19} />
        </Pressable>
        <Text style={{ fontFamily: F.semi, fontSize: 20, color: C.ink }}>Settings</Text>
      </View>
    </View>
  );
}
