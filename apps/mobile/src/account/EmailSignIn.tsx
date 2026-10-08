import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring,
  withTiming, ZoomIn
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import { Icon } from '../ui/icons';
import { EMAIL_SIGN_IN_MESSAGE, signInWithEmail } from './account';
import { confirmCode, EMAIL_MESSAGE, MIN_PASSWORD, resendCode, startPasswordReset, startSignUp, type CodeKind } from './emailAccount';

type Mode = 'signin' | 'signup' | 'forgot' | 'code' | 'done';
const CODE_LENGTH = 6;
const RESEND_AFTER_S = 30;
const OFFSCREEN = 900; // px below its resting place: further than the tallest sheet, so it starts hidden

/** Bottom sheet for email accounts: sign in, create an account (confirmed with a 6-digit code), or reset a password.
 * Springs up over a fading backdrop and rides on top of the keyboard. */
export function EmailSignIn({ visible, onClose, onSignedIn, start = 'signin' }: {
  visible: boolean; onClose: () => void; onSignedIn: () => void; start?: 'signin' | 'signup';
}) {
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(start);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<CodeKind>('link');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Driven by hand: Reanimated's SlideInDown starts from the wrong place inside an Android Modal and bounces.
  const slide = useSharedValue(OFFSCREEN);

  useEffect(() => {
    if (!visible) return;
    if (closing.current) clearTimeout(closing.current);
    setMode(start); setPassword(''); setCode(''); setNote(null); setBusy(false);
    setMounted(true); setOpen(true);
    slide.value = OFFSCREEN;
    slide.value = still ? 0 : withSpring(0, { damping: 24, stiffness: 240, mass: 0.9, overshootClamping: true });
  }, [visible, start, still, slide]);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const close = () => {
    if (busy) return;
    setOpen(false); // the backdrop fades and the sheet slides away, then the Modal goes
    slide.value = still ? OFFSCREEN : withTiming(OFFSCREEN, { duration: 240 });
    closing.current = setTimeout(() => { setMounted(false); onClose(); }, 260);
  };

  // A Modal is its own window on Android, so useAnimatedKeyboard (main window only) never sees the keyboard here;
  // RN's Keyboard events do. iOS sends "will" events in time to move with the keyboard; Android only "did".
  const keyboard = useSharedValue(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      keyboard.value = withTiming(e.endCoordinates.height, { duration: ios ? e.duration || 250 : 200 });
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      keyboard.value = withTiming(0, { duration: ios ? e.duration || 250 : 200 });
    });
    return () => { show.remove(); hide.remove(); };
  }, [keyboard]);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: slide.value - Math.max(0, keyboard.value - insets.bottom) }] }));
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const fail = (message: string) => {
    setNote(message);
    if (!still) shakeX.value = withSequence(withTiming(-9, { duration: 45 }), withTiming(9, { duration: 70 }), withTiming(-6, { duration: 60 }), withTiming(0, { duration: 50 }));
  };
  const go = (next: Mode) => { setNote(null); setMode(next); };
  const finish = () => {
    setMode('done');
    setTimeout(() => { onSignedIn(); close(); }, 1000);
  };
  const toCode = (k: CodeKind) => { setKind(k); setCode(''); setResendIn(RESEND_AFTER_S); go('code'); };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setNote(null);
    try { await work(); } finally { setBusy(false); }
  };

  const signIn = () => run(async () => {
    const r = await signInWithEmail(email, password);
    if (r === 'switched') return finish();
    if (r === 'unconfirmed') { await resendCode('signup', email); toCode('signup'); return; }
    fail(EMAIL_SIGN_IN_MESSAGE[r]);
  });
  const signUp = () => run(async () => {
    const r = await startSignUp(email, password, name);
    if (r.status === 'code_sent') toCode(r.kind); else fail(EMAIL_MESSAGE[r.status]);
  });
  const forgot = () => run(async () => {
    const r = await startPasswordReset(email);
    if (r.status === 'code_sent') { setPassword(''); toCode(r.kind); } else fail(EMAIL_MESSAGE[r.status]);
  });
  const confirm = (digits = code) => run(async () => {
    if (kind === 'recovery' && password.length < MIN_PASSWORD) return fail(EMAIL_MESSAGE.weak);
    const r = await confirmCode(kind, email, digits, password);
    if (r === 'linked' || r === 'switched') finish(); else fail(EMAIL_MESSAGE[r]);
  });
  const resend = () => run(async () => {
    const r = await resendCode(kind, email);
    if (r === 'sent') { setResendIn(RESEND_AFTER_S); setNote(null); } else fail(EMAIL_MESSAGE[r]);
  });
  const onCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH && kind !== 'recovery') void confirm(digits); // the code is the last step: submit it straight away
  };

  const field = (props: React.ComponentProps<typeof TextInput>) => (
    <TextInput placeholderTextColor={C.muted} style={s.input} editable={!busy} {...props} />
  );
  const emailField = () => field({ value: email, onChangeText: setEmail, placeholder: 'Email', autoCapitalize: 'none', autoComplete: 'email',
    keyboardType: 'email-address', textContentType: 'emailAddress', accessibilityLabel: 'Email' });

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      {open && (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(220)} style={s.scrim}>
          <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
        </Animated.View>
      )}
      {mounted && (
        <Animated.View style={[s.wrap, lift]}>
          <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 16 }, shakeStyle]}>
            <View style={s.grabber} />
            <Animated.View key={mode} entering={FadeInDown.duration(260)} style={{ gap: 10 }}>
              {mode === 'signin' && (<>
                <Text style={s.h1}>Sign in with email</Text>
                {emailField()}
                {field({ value: password, onChangeText: setPassword, placeholder: 'Password', secureTextEntry: true, autoComplete: 'password',
                  textContentType: 'password', onSubmitEditing: signIn, accessibilityLabel: 'Password' })}
                <Pressable onPress={() => go('forgot')} accessibilityRole="button" style={s.inlineLink}><Text style={s.link}>Forgot password?</Text></Pressable>
              </>)}
              {mode === 'signup' && (<>
                <Text style={s.h1}>Create your account</Text>
                <Text style={s.p}>Keep your Daily Plus and sign in on any phone.</Text>
                {field({ value: name, onChangeText: setName, placeholder: 'Your name', autoCapitalize: 'words', autoComplete: 'name',
                  textContentType: 'name', accessibilityLabel: 'Your name' })}
                {emailField()}
                {field({ value: password, onChangeText: setPassword, placeholder: `Password (${MIN_PASSWORD}+ characters)`, secureTextEntry: true,
                  autoComplete: 'new-password', textContentType: 'newPassword', onSubmitEditing: signUp, accessibilityLabel: 'Password' })}
              </>)}
              {mode === 'forgot' && (<>
                <Text style={s.h1}>Reset your password</Text>
                <Text style={s.p}>We’ll email you a 6-digit code.</Text>
                {emailField()}
              </>)}
              {mode === 'code' && (<>
                <Text style={s.h1}>Check your email</Text>
                <Text style={s.p}>Enter the {CODE_LENGTH}-digit code we sent to <Text style={{ color: C.ink, fontFamily: F.semi }}>{email.trim()}</Text>.</Text>
                <CodeBoxes value={code} onChange={onCode} disabled={busy} />
                {kind === 'recovery' && field({ value: password, onChangeText: setPassword, placeholder: `New password (${MIN_PASSWORD}+ characters)`,
                  secureTextEntry: true, autoComplete: 'new-password', textContentType: 'newPassword', accessibilityLabel: 'New password' })}
                <Pressable onPress={resend} disabled={busy || resendIn > 0} accessibilityRole="button" style={s.inlineLink}>
                  <Text style={[s.link, resendIn > 0 && { color: C.muted, textDecorationLine: 'none' }]}>{resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}</Text>
                </Pressable>
              </>)}
              {mode === 'done' && (
                <View style={s.done}>
                  <Animated.View entering={ZoomIn.springify().damping(11)} style={s.check}><Icon name="check" size={26} color={C.white} /></Animated.View>
                  <Text style={s.h1}>You’re signed in</Text>
                </View>
              )}

              {note ? <Animated.Text entering={FadeInDown.duration(200)} style={s.note} accessibilityLiveRegion="polite">{note}</Animated.Text> : null}

              {mode !== 'done' && mode !== 'code' || (mode === 'code' && kind === 'recovery') ? (
                <Pressable onPress={mode === 'signin' ? signIn : mode === 'signup' ? signUp : mode === 'forgot' ? forgot : () => confirm()}
                  disabled={busy} accessibilityRole="button" style={({ pressed }) => [s.primary, busy && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.97 }] }]}>
                  {busy ? <ActivityIndicator color={C.white} /> : (
                    <Text style={s.primaryText}>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send code' : 'Set new password'}</Text>
                  )}
                </Pressable>
              ) : mode === 'code' && busy ? <ActivityIndicator color={C.ink} style={{ marginVertical: 14 }} /> : null}

              {mode === 'signin' && <Switcher text="New to Daily?" action="Create account" onPress={() => go('signup')} />}
              {mode === 'signup' && <Switcher text="Already have an account?" action="Sign in" onPress={() => go('signin')} />}
              {mode === 'forgot' && <Switcher text="Remembered it?" action="Back to sign in" onPress={() => go('signin')} />}
              {mode === 'code' && <Switcher text="Wrong email?" action="Change it" onPress={() => go(kind === 'recovery' ? 'forgot' : 'signup')} />}
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}
    </Modal>
  );
}

function Switcher({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={s.switcher}>
      <Text style={s.p}>{text} <Text style={s.link}>{action}</Text></Text>
    </Pressable>
  );
}

/** Six boxes over one hidden input, so paste, autofill and the number pad all just work. */
function CodeBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const input = useRef<TextInput>(null);
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 350); return () => clearTimeout(t); }, []);
  return (
    <Pressable onPress={() => input.current?.focus()} style={s.codeRow} accessibilityLabel="Verification code">
      {Array.from({ length: CODE_LENGTH }, (_, i) => (
        <View key={i} style={[s.box, i === Math.min(value.length, CODE_LENGTH - 1) && !disabled && s.boxOn]}>
          {value[i] ? <Animated.Text entering={ZoomIn.duration(140)} style={s.digit}>{value[i]}</Animated.Text> : null}
        </View>
      ))}
      <TextInput ref={input} value={value} onChangeText={onChange} editable={!disabled} keyboardType="number-pad" maxLength={CODE_LENGTH}
        autoComplete="one-time-code" textContentType="oneTimeCode" caretHidden style={s.hiddenInput} accessibilityLabel="Verification code" />
    </Pressable>
  );
}

const s = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(23,23,23,0.42)' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 14 },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  p: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.body },
  input: { minHeight: 52, borderRadius: 16, backgroundColor: C.white, paddingHorizontal: 16, fontFamily: F.regular, fontSize: 15, color: C.ink, borderWidth: 1, borderColor: C.line },
  note: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.danger },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  link: { fontFamily: F.semi, fontSize: 14, color: C.ink, textDecorationLine: 'underline' },
  inlineLink: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  switcher: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  box: { width: 48, height: 58, borderRadius: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: C.ink, borderWidth: 2 },
  digit: { fontFamily: F.semi, fontSize: 24, color: C.ink },
  hiddenInput: { position: 'absolute', opacity: 0.01, width: '100%', height: '100%' },
  done: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.ok, alignItems: 'center', justifyContent: 'center' }
});
