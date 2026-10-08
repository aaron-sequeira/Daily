import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import { EMAIL_SIGN_IN_MESSAGE, signInWithEmail } from './account';

/** Bottom sheet: sign in to an existing email account. There is no sign-up here; new people use Google. */
export function EmailSignIn({ visible, onClose, onSignedIn }: { visible: boolean; onClose: () => void; onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const close = () => { if (busy) return; setPassword(''); setNote(null); onClose(); };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const r = await signInWithEmail(email, password);
    setBusy(false);
    if (r === 'switched') { setPassword(''); onSignedIn(); } else setNote(EMAIL_SIGN_IN_MESSAGE[r]);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={s.scrim} onPress={close} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom']} style={s.sheet}>
          <Text style={s.h1}>Sign in with email</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={C.muted} style={s.input}
            autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" editable={!busy} accessibilityLabel="Email" />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={C.muted} style={s.input}
            secureTextEntry autoComplete="password" textContentType="password" editable={!busy} onSubmitEditing={submit} accessibilityLabel="Password" />
          {note ? <Text style={s.note} accessibilityLiveRegion="polite">{note}</Text> : null}
          <Pressable onPress={submit} disabled={busy} accessibilityRole="button" style={[s.primary, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color={C.white} /> : <Text style={s.primaryText}>Sign in</Text>}
          </Pressable>
          <Pressable onPress={close} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>Cancel</Text></Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 22, gap: 10 },
  h1: { fontFamily: F.semi, fontSize: 20, color: C.ink, marginBottom: 6 },
  input: { minHeight: 52, borderRadius: 16, backgroundColor: C.white, paddingHorizontal: 16, fontFamily: F.regular, fontSize: 15, color: C.ink, borderWidth: 1, borderColor: C.line },
  note: { fontFamily: F.regular, fontSize: 13, color: C.danger },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: F.medium, fontSize: 14, color: C.body }
});
