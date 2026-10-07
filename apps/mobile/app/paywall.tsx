import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { account, SIGN_IN_MESSAGE, signedIn, signInWithGoogle } from '../src/account/account';
import { getDb } from '../src/db/expoDb';
import { getSetting } from '../src/db/settings';
import { purchaseMessage, savePercent, type Offer, type PlanId } from '../src/plus/billing';
import { saveEntitlement } from '../src/plus/entitlement';
import { getBilling } from '../src/plus/getBilling';
import { ctaLabel, day7Label, endDayLabel, finePrint, paywallMode, reminderDayLabel } from '../src/plus/paywallCopy';
import { isPlus } from '../src/plus/plus';
import { linkUser } from '../src/plus/start';
import { ensureUserId } from '../src/plus/supabase';
import { expoNotifier } from '../src/reminders/expoNotifier';
import { Sunny } from '../src/sunny/Sunny';
import { C, F } from '../src/theme';
import { Icon, type IconName } from '../src/ui/icons';
import { rise } from '../src/ui/motion';

const TERMS = 'https://aaron-sequeira.github.io/Daylens/daily/terms.html';
const PRIVACY = 'https://aaron-sequeira.github.io/Daylens/daily/privacy.html';

const PERKS: { icon: IconName | 'sun'; bg: string; title: string; line: string }[] = [
  { icon: 'report', bg: '#D8D2FC', title: 'Your day, written', line: 'A short story at 9 pm, with two small things to try tomorrow.' },
  { icon: 'week', bg: '#BFEBD3', title: 'Week in a sentence', line: 'How your week went, next to the one before.' },
  { icon: 'refresh', bg: '#F4C6C8', title: 'Rewrite any day', line: 'Not quite right? Ask Sunny for another take.' },
  { icon: 'sun', bg: '#F9DDB9', title: 'Sunny on top', line: 'A floating Sunny bubble that cheers you on in other apps.' }
];

export default function Paywall() {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { change } = useLocalSearchParams<{ change?: string }>();
  // A subscriber is never sold a second subscription: a calm "you have it" state, or only the switch to yearly.
  const [mode] = useState(() => paywallMode(isPlus(getDb()), change));
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [plan, setPlan] = useState<PlanId>('yearly');
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);
  const left = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [anon, setAnon] = useState(false); // hidden until we know, so it never flashes for a signed-in user
  useEffect(() => { account().then((a) => setAnon(!a)).catch(() => {}); }, []);
  const [signNote, setSignNote] = useState<string | null>(null);
  const signIn = async () => {
    const r = await signInWithGoogle();
    if (signedIn(r)) setAnon(false); else setSignNote(SIGN_IN_MESSAGE[r] ?? null);
  };

  /** Leaves once: a purchase landing after the user already went back must not pop a second screen. */
  const leave = () => {
    if (left.current || !mounted.current) return;
    left.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const load = useCallback(() => {
    setLoading(true);
    getBilling().offers()
      .then((o) => {
        setOffers(o);
        setLoadFailed(o.length === 0);
        if (o.length) setPlan((p) => (o.some((x) => x.plan === p) ? p : o[0].plan));
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const save = offers ? savePercent(offers) : null;
  const yearly = offers?.find((o) => o.plan === 'yearly');
  const monthly = offers?.find((o) => o.plan === 'monthly');
  // A plan switch has no free trial, so its copy never promises one.
  const offer = mode === 'change' ? (yearly && { ...yearly, trialDays: null }) : offers?.find((o) => o.plan === plan);

  const halo = useSharedValue(0);
  const ring = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    halo.value = withRepeat(withTiming(1, { duration: 1800 }), -1, true);
    ring.value = withDelay(1400, withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 0 })), 2));
  }, [reduced, halo, ring]);
  const haloStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + halo.value * 0.07 }], opacity: 0.6 + halo.value * 0.35 }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.28 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.08 }] }));

  async function buy() {
    if (busy.current || !offer) return;
    busy.current = true;
    setBuying(true);
    setNote(null);
    try {
      await linkUser({ billing: getBilling(), ensureUserId }); // the purchase lands on the same user the server token names
      const r = await getBilling().purchase(offer.plan);
      if (r.ok) {
        try { await saveEntitlement(getDb(), r.ent, expoNotifier, Date.now()); } catch (e) { console.warn('daily: saving entitlement failed', e); }
        leave();
      } else if (!r.cancelled) setNote(r.message);
    } catch {
      setNote(purchaseMessage(null));
    } finally {
      busy.current = false;
      setBuying(false);
    }
  }

  async function restore() {
    if (busy.current) return;
    busy.current = true;
    setRestoring(true);
    setNote(null);
    try {
      await linkUser({ billing: getBilling(), ensureUserId });
      const ent = await getBilling().restore();
      try { await saveEntitlement(getDb(), ent, expoNotifier, Date.now()); } catch (e) { console.warn('daily: saving entitlement failed', e); }
      if (ent.active) leave();
      else setNote('No Daily Plus purchase found for this Google account.');
    } catch {
      setNote(purchaseMessage(null));
    } finally {
      busy.current = false;
      setRestoring(false);
    }
  }

  const open = (url: string) => { Linking.openURL(url).catch(() => {}); };
  const manage = () => {
    const current = getSetting(getDb(), 'plus_plan');
    try { open(getBilling().manageUrl(current === 'monthly' || current === 'yearly' ? current : null)); } catch { /* no store to open */ }
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 20, paddingHorizontal: 20 }}>
      <Animated.View entering={rise(0)} style={s.top}>
        {mode === 'owned' ? <View /> : (
          <Pressable onPress={restore} disabled={restoring || buying} accessibilityRole="button" style={s.restoreBtn}>
            {restoring ? <ActivityIndicator size="small" color={C.ink} /> : <Text style={[s.link, { color: C.ink, fontSize: 13 }]}>Restore</Text>}
          </Pressable>
        )}
        <Pressable onPress={leave} disabled={buying || restoring} accessibilityRole="button" accessibilityLabel="Close" accessibilityState={{ disabled: buying || restoring }} style={[s.close, (buying || restoring) && { opacity: 0.5 }]}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"><Path d="M6 6l12 12M18 6 6 18" stroke={C.ink} strokeWidth={2.2} strokeLinecap="round" /></Svg>
        </Pressable>
      </Animated.View>

      <View style={s.hero}>
        <Animated.View style={[s.halo, haloStyle]} />
        <Animated.View entering={ZoomIn.springify().damping(12).delay(100)} style={s.sunny}>
          <Sunny face="glowing" size={112} />
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(800).delay(450)} style={s.storyChip}>
          <View style={s.storyInner}>
            <Text style={s.chipKicker}>YOUR DAY, WRITTEN</Text>
            <Text style={s.chipBody}>A calmer day: <Text style={{ fontFamily: F.semi }}>2h 48m</Text>, 34m under your average.</Text>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(800).delay(600)} style={s.breakWrap}>
          <View style={s.breakChip}>
            <Sunny face="happy" size={30} />
            <Text style={s.breakText}>Nice break, keep it up</Text>
          </View>
        </Animated.View>
      </View>

      <Animated.View entering={rise(2)} style={s.titleBlock}>
        <Text style={s.pill}>DAILY PLUS</Text>
        <Text style={s.h1}>{mode === 'owned' ? 'You’re on Daily Plus' : 'Let Sunny write your day'}</Text>
        <Text style={s.sub}>{mode === 'owned' ? 'Everything below is already yours. Thanks for being here.' : 'Your phone time, turned into a short, kind story every evening.'}</Text>
      </Animated.View>

      {mode === 'owned' ? (
        <Animated.View entering={rise(3)} style={{ marginTop: 18 }}>
          <Pressable onPress={manage} accessibilityRole="button" style={s.cta}><Text style={s.ctaText}>Manage in Google Play</Text></Pressable>
          <Pressable onPress={leave} accessibilityRole="button" style={s.retry}><Text style={[s.retryText, { textAlign: 'center' }]}>Back</Text></Pressable>
        </Animated.View>
      ) : null}

      <Animated.View entering={rise(4)} style={s.perks}>
        {PERKS.map((p) => (
          <View key={p.title} style={s.perk}>
            <View style={[s.perkIcon, { backgroundColor: p.bg }]}>
              {p.icon === 'sun'
                ? <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"><Path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" stroke={C.ink} strokeWidth={2} strokeLinecap="round" /></Svg>
                : <Icon name={p.icon} size={16} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.perkTitle}>{p.title}</Text>
              <Text style={s.perkLine}>{p.line}</Text>
            </View>
          </View>
        ))}
      </Animated.View>

      {mode === 'owned' ? null : (
        <>
          <Animated.View entering={rise(6)} style={s.plans} accessibilityRole="radiogroup">
            <PlanCard name={mode === 'change' ? 'Switch to yearly' : 'Yearly'} line={yearly?.perMonthString ? `${yearly.perMonthString} a month, billed once a year` : ''} price={yearly?.priceString ?? ''} on={mode === 'change' || plan === 'yearly'} badge={save !== null ? `SAVE ${save}%` : null} onPress={() => setPlan('yearly')} />
            {mode === 'change' ? null : <PlanCard name="Monthly" line="Billed every month" price={monthly?.priceString ?? ''} on={plan === 'monthly'} badge={null} onPress={() => setPlan('monthly')} />}
          </Animated.View>

          {offer?.trialDays ? (
            <Animated.View entering={rise(8)} style={s.timeline}>
              <View style={s.tlLine} />
              <TimelineCol dot="done" title="Today" line="Everything unlocks" />
              <TimelineCol dot="next" title={reminderDayLabel(offer)} line="We remind you" />
              <TimelineCol dot="later" title={endDayLabel(offer)} line={day7Label(offer)} />
            </Animated.View>
          ) : null}

          {loadFailed ? (
            <View style={s.noteBox}>
              <Text style={s.note}>Couldn’t load prices. Check your connection.</Text>
              <Pressable onPress={load} disabled={loading} accessibilityRole="button" style={s.retry}>
                {loading ? <ActivityIndicator size="small" color={C.ink} /> : <Text style={s.retryText}>Try again</Text>}
              </Pressable>
            </View>
          ) : null}
          {note ? <Text style={[s.note, { marginTop: 12 }]}>{note}</Text> : null}

          <Animated.View entering={rise(9)} style={{ marginTop: 18 }}>
            <Animated.View pointerEvents="none" style={[s.ring, ringStyle]} />
            <Pressable onPress={buy} disabled={!offer || buying || restoring} accessibilityRole="button" accessibilityState={{ disabled: !offer || buying || restoring }} style={[s.cta, (!offer || buying || restoring) && { opacity: 0.6 }]}>
              {buying || restoring ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{mode === 'change' && offer ? 'Switch to yearly' : ctaLabel(offer)}</Text>}
            </Pressable>
          </Animated.View>
          <Animated.Text entering={rise(10)} style={s.fine}>{finePrint(offer)}</Animated.Text>

          <Animated.View entering={rise(11)} style={s.footer}>
            <Pressable onPress={restore} disabled={restoring || buying} accessibilityRole="button" style={s.footBtn}><Text style={s.link}>Restore purchases</Text></Pressable>
            <Text style={s.dotSep}>·</Text>
            <Pressable onPress={() => open(TERMS)} accessibilityRole="link" style={s.footBtn}><Text style={s.link}>Terms</Text></Pressable>
            <Text style={s.dotSep}>·</Text>
            <Pressable onPress={() => open(PRIVACY)} accessibilityRole="link" style={s.footBtn}><Text style={s.link}>Privacy</Text></Pressable>
          </Animated.View>
          {anon ? (
            <Animated.View entering={rise(12)} style={s.footer}>
              <Text style={s.link}>Sign in so Plus follows you to a new phone.</Text>
              <Pressable onPress={signIn} accessibilityRole="button" style={s.footBtn}><Text style={[s.link, { color: C.ink, textDecorationLine: 'underline' }]}>Sign in</Text></Pressable>
            </Animated.View>
          ) : null}
          {signNote ? <Text style={[s.note, { marginTop: 4 }]}>{signNote}</Text> : null}
        </>
      )}
    </ScrollView>
  );
}

function PlanCard({ name, line, price, on, badge, onPress }: { name: string; line: string; price: string; on: boolean; badge: string | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[s.plan, on ? s.planOn : s.planOff]}>
      <View style={[s.dot, on && { borderColor: C.ink, backgroundColor: C.ink }]}>
        {on ? <Svg width={12} height={12} viewBox="0 0 24 24" fill="none"><Path d="m5 12 5 5 9-10" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.planName}>{name}</Text>
        {line ? <Text style={s.planLine}>{line}</Text> : null}
      </View>
      <Text style={s.planPrice}>{price}</Text>
      {badge ? <Text style={s.save}>{badge}</Text> : null}
    </Pressable>
  );
}

function TimelineCol({ dot, title, line }: { dot: 'done' | 'next' | 'later'; title: string; line: string }) {
  return (
    <View style={s.tlCol}>
      <View style={[s.tlDot, dot === 'done' ? { backgroundColor: C.ink } : { backgroundColor: '#fff', borderWidth: 2, borderColor: dot === 'next' ? C.ink : '#C9C2BB' }]}>
        {dot === 'done' ? <Svg width={10} height={10} viewBox="0 0 24 24" fill="none"><Path d="m5 12 5 5 9-10" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
      </View>
      <Text style={s.tlTitle}>{title}</Text>
      <Text style={s.tlLineText}>{line}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  restoreBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  hero: { height: 172, marginTop: 2 },
  halo: { position: 'absolute', left: '50%', top: 10, width: 150, height: 150, marginLeft: -75, borderRadius: 75, backgroundColor: '#FFE9C2' },
  sunny: { position: 'absolute', left: '50%', top: 29, marginLeft: -56, width: 112, height: 112 },
  storyChip: { position: 'absolute', right: -4, top: 16, width: 140 },
  storyInner: { backgroundColor: '#D8D2FC', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 11, transform: [{ rotate: '5deg' }], elevation: 3 },
  chipKicker: { fontFamily: F.semi, fontSize: 8.5, letterSpacing: 0.5, color: 'rgba(0,0,0,0.55)' },
  chipBody: { fontFamily: F.regular, fontSize: 11, lineHeight: 15, marginTop: 4, color: C.ink },
  breakWrap: { position: 'absolute', left: -2, top: 104 },
  breakChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.white, borderRadius: 999, paddingVertical: 4, paddingLeft: 4, paddingRight: 12, transform: [{ rotate: '-4deg' }], elevation: 3 },
  breakText: { fontFamily: F.semi, fontSize: 11, color: C.ink },
  titleBlock: { alignItems: 'center', marginTop: 4 },
  pill: { backgroundColor: C.ink, color: '#FFC861', fontFamily: F.semi, fontSize: 11, letterSpacing: 1.3, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden' },
  h1: { fontFamily: F.semi, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: C.ink, marginTop: 10, textAlign: 'center' },
  sub: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.body, marginTop: 8, marginHorizontal: 18, textAlign: 'center' },
  perks: { marginTop: 14, backgroundColor: C.white, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 16 },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  perkIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  perkTitle: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  perkLine: { fontFamily: F.regular, fontSize: 12.5, lineHeight: 17, color: C.muted, marginTop: 1 },
  plans: { gap: 12, marginTop: 18 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.white },
  planOn: { borderWidth: 2, borderColor: C.ink, paddingVertical: 11.5, paddingHorizontal: 13.5 },
  planOff: { borderWidth: 1.5, borderColor: C.line },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#C9C2BB', alignItems: 'center', justifyContent: 'center' },
  planName: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  planLine: { fontFamily: F.regular, fontSize: 12.5, color: C.muted },
  planPrice: { fontFamily: F.semi, fontSize: 16, color: C.ink },
  save: { position: 'absolute', top: -10, right: 14, backgroundColor: '#F6B35E', color: '#3A2412', fontFamily: F.semi, fontSize: 11, letterSpacing: 0.2, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden' },
  timeline: { flexDirection: 'row', gap: 6, marginTop: 18 },
  tlLine: { position: 'absolute', top: 8, left: '16%', right: '16%', height: 2, backgroundColor: C.line },
  tlCol: { flex: 1, alignItems: 'center' },
  tlDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tlTitle: { fontFamily: F.semi, fontSize: 12, color: C.ink, marginTop: 8 },
  tlLineText: { fontFamily: F.regular, fontSize: 11.5, lineHeight: 15, color: C.muted, marginTop: 2, textAlign: 'center' },
  noteBox: { marginTop: 14, alignItems: 'center' },
  note: { fontFamily: F.regular, fontSize: 12.5, color: C.muted, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  retryText: { fontFamily: F.semi, fontSize: 13, color: C.ink },
  ring: { position: 'absolute', left: 0, right: 0, top: 0, height: 56, borderRadius: 28, backgroundColor: C.ink },
  cta: { minHeight: 56, borderRadius: 28, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: F.semi, fontSize: 16, color: '#fff' },
  fine: { fontFamily: F.regular, fontSize: 12, lineHeight: 17, color: C.muted, textAlign: 'center', marginTop: 10, marginHorizontal: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  footBtn: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  dotSep: { color: '#C9C2BB' }
});
