import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DailyNative from '../modules/daily-native';
import { account, firstName, SIGN_IN_MESSAGE, signedIn, signInWithGoogle } from '../src/account/account';
import { getDb } from '../src/db/expoDb';
import { getNumber, setSetting } from '../src/db/settings';
import { applyReminders } from '../src/reminders/apply';
import { turnOffBuiltins } from '../src/reminders/store';
import { syncSunnyService } from '../src/sunny/service';
import { Sunny } from '../src/sunny/Sunny';
import { C, F } from '../src/theme';
import { GoalStepper } from '../src/ui/GoalStepper';
import { GoogleButton } from '../src/ui/GoogleButton';
import { Icon } from '../src/ui/icons';
import { rise } from '../src/ui/motion';

const STEPS = 5;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const finishing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [showSunny, setShowSunny] = useState(() => { try { return DailyNative.hasUsageAccess(); } catch { return false; } });
  const [goal, setGoal] = useState(() => getNumber(getDb(), 'goal_min'));
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const google = async () => {
    if (signingIn || finishing.current) return;
    setSigningIn(true);
    setSignInError(null);
    const r = await signInWithGoogle();
    if (signedIn(r)) {
      setWho(firstName(await account().catch(() => null)));
      setTimeout(() => { void finish(); }, 900);
    } else setSignInError(SIGN_IN_MESSAGE[r] ?? null);
    setSigningIn(false);
  };

  // Coming back from Android Settings with access granted moves on by itself.
  useEffect(() => {
    if (step !== 1) return;
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && DailyNative.hasUsageAccess()) { setShowSunny(true); setStep(2); } });
    return () => sub.remove();
  }, [step]);

  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    const db = getDb();
    setSetting(db, 'goal_min', goal);
    setSetting(db, 'sunny_service', showSunny ? '1' : '0');
    setSetting(db, 'onboarded', '1');
    syncSunnyService(db, DailyNative);
    await applyReminders();
    router.replace('/');
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <View style={s.steps}>
        {Array.from({ length: STEPS }, (_, i) => <View key={i} style={[s.bar, i === step && { backgroundColor: C.ink }]} />)}
        <Text style={s.stepText}>Step {step + 1} of {STEPS}</Text>
      </View>

      <Animated.View key={step} entering={rise(0)} style={{ flex: 1 }}>
        {/* Scrolls on short screens so the last row never hides behind the buttons. */}
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <View style={s.body}>
            <View style={s.hero}><Sunny face="glowing" size={170} /></View>
            <Text style={s.h1}>Meet Sunny</Text>
            <Text style={s.p}>Sunny glows when your phone time stays low and dims as it climbs past your goal. Daily keeps everything on this phone.</Text>
          </View>
        )}
        {step === 1 && (
          <View style={s.body}>
            <View style={[s.hero, { backgroundColor: '#D8D2FC' }]}><Sunny face="happy" size={120} /></View>
            <Text style={s.h1}>Let Daily see which apps you use</Text>
            <Text style={s.p}>Android asks once. Turn on Daily on the next screen, then come back.</Text>
            <View style={s.point}><View style={s.pointIco}><Icon name="lock" size={15} /></View><Text style={s.pointText}>Stays on this phone. No cloud copy.</Text></View>
            <View style={s.point}><View style={s.pointIco}><Icon name="eyeOff" size={15} /></View><Text style={s.pointText}>Only app names and minutes. Never your messages, photos or screen.</Text></View>
          </View>
        )}
        {step === 2 && (
          <View style={s.body}>
            <Text style={s.h1}>Pick a daily phone goal</Text>
            <Text style={s.p}>Sunny stays happy under half of it and starts to fade once you pass it. You can change it any time.</Text>
            <View style={{ alignItems: 'center', marginTop: 28 }}><GoalStepper value={goal} onChange={setGoal} /></View>
          </View>
        )}
        {step === 3 && (
          <View style={s.body}>
            <View style={[s.hero, { backgroundColor: '#CFE6FB' }]}><Sunny face="happy" size={120} /></View>
            <Text style={s.h1}>Reminders that look after you</Text>
            <Text style={s.p}>Daily nudges you when it’s time for a break. You can change or turn off any of them.</Text>
            <View style={s.point}><View style={s.pointIco}><Icon name="drop" size={15} /></View><Text style={s.pointText}>Water after every hour of phone time.</Text></View>
            <View style={s.point}><View style={s.pointIco}><Icon name="cup" size={15} /></View><Text style={s.pointText}>Lunch at 1 pm and tea at 4 pm on weekdays.</Text></View>
            <View style={s.point}>
              <View style={s.pointIco}><Icon name="bell" size={15} /></View>
              <Text style={s.pointText}>Show Sunny and your phone time in the status bar</Text>
              <Switch value={showSunny} onValueChange={setShowSunny} accessibilityLabel="Show Sunny in the status bar" trackColor={{ false: C.line, true: C.ink }} thumbColor={C.white} />
            </View>
          </View>
        )}
        {step === 4 && (
          <View style={s.body}>
            <View style={[s.hero, { backgroundColor: '#FCEBC9' }]}>
              <Animated.View entering={ZoomIn.delay(150).springify().damping(12)}><Sunny face={who ? 'happy' : 'glowing'} size={120} /></Animated.View>
            </View>
            <Text style={s.h1}>Keep Sunny with you</Text>
            <Text style={s.p}>Your reports stay on this phone. Sign in so Daily Plus follows you to a new phone.</Text>
            {who ? (
              <Animated.View entering={ZoomIn.springify()} style={s.point}>
                <View style={[s.pointIco, { backgroundColor: C.ok }]}><Icon name="check" size={15} /></View>
                <Text style={s.pointText} accessibilityLiveRegion="polite">Signed in as {who}</Text>
              </Animated.View>
            ) : null}
            {signInError ? <Animated.Text entering={FadeIn} style={s.error} accessibilityLiveRegion="polite">{signInError}</Animated.Text> : null}
          </View>
        )}
        </ScrollView>
      </Animated.View>

      <View style={{ gap: 8 }}>
        {step === 0 && <Primary label="Get started" onPress={() => setStep(1)} />}
        {step === 1 && (
          <>
            <Primary label="Open settings" onPress={() => DailyNative.openUsageAccessSettings()} />
            <Pressable onPress={() => setStep(2)} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>Not now, just reminders</Text></Pressable>
          </>
        )}
        {step === 2 && <Primary label="Next" onPress={() => setStep(3)} />}
        {step === 3 && (
          <>
            <Primary label="Turn on reminders" onPress={async () => { await Notifications.requestPermissionsAsync().catch(() => null); setStep(4); }} />
            <Pressable onPress={async () => { turnOffBuiltins(getDb()); if (showSunny) await Notifications.requestPermissionsAsync().catch(() => null); setStep(4); }} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>Not now</Text></Pressable>
          </>
        )}
        {step === 4 && !who && (
          <>
            <GoogleButton busy={signingIn} onPress={google} />
            <Pressable onPress={() => { void finish(); }} disabled={busy || signingIn} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>Skip for now</Text></Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function Primary({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { width: 22, height: 6, borderRadius: 9, backgroundColor: '#D8CFC7' },
  stepText: { marginLeft: 'auto', fontFamily: F.regular, fontSize: 12, color: C.muted },
  body: { flex: 1, paddingTop: 28, paddingBottom: 12 },
  hero: { backgroundColor: '#FFEFD4', borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingVertical: 26, marginBottom: 22 },
  h1: { fontFamily: F.medium, fontSize: 30, lineHeight: 33, letterSpacing: -0.6, color: C.ink, marginBottom: 10 },
  p: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.body, marginBottom: 16 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  pointIco: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.ink },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: F.medium, fontSize: 14, color: C.body },
  error: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.danger, marginTop: 4 }
});
