import * as AppleAuthentication from 'expo-apple-authentication';
import { ActivityIndicator, View } from 'react-native';
import { C } from '../theme';

/** Apple's own "Continue with Apple" button (App Review expects the system button), shaped like Daily's pills. */
export function AppleButton({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  if (busy) return <View style={{ minHeight: 54, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.white} /></View>;
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={27}
      style={{ height: 54 }}
      onPress={onPress}
    />
  );
}
