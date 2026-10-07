# Daily Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional Google sign-in for Daily on Android. Linking keeps the anonymous user's id, so Daily Plus follows the
Google account to a new phone. The sign-in is offered in onboarding, Settings and the paywall.

**Architecture:**
- A Kotlin `googleSignIn` in the existing `daily-native` Expo module uses Credential Manager to get a Google id token,
  with a nonce made in Kotlin.
- `src/account/account.ts` hands the token to Supabase:
  - `linkIdentity` keeps the user id.
  - If the Google account is already on Daily, it falls back to `signInWithIdToken` and runs `resyncPlus`.
- The screens call `signInWithGoogle()` / `account()` / `signOut()`.

**Tech Stack:**
- Expo SDK 57, RN 0.86, expo-router, react-native-reanimated 4.5, react-native-svg.
- @supabase/supabase-js (auth-js 2.108.2).
- androidx.credentials 1.5.0, googleid 1.1.1.
- Vitest 2.

**Spec:** `docs/superpowers/specs/2026-10-08-daily-sign-in-design.md`

## Global Constraints

- Sign-in is optional everywhere. No screen, purchase or feature may require it.
- No new npm dependencies. The nonce is made in Kotlin (`SecureRandom` + `MessageDigest`).
- The Web client ID comes only from `process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, which is set in the gitignored
  `apps/mobile/.env`. Never commit `.env`. No secrets in code.
- Copy is exactly as the spec words it, using typographic apostrophes (’) as the rest of the app does. Files stay UTF-8
  with no Windows-1252 bytes.
- Reduced motion: use Reanimated layout animations only; their default `ReduceMotion.System` turns them off.
- Never stage `.codex/` or `marketing/`. Never push. On the phone (adb serial `R85H8TTGGULF75UW`), touch only
  `com.aaronalex.daily`.
- Tests: `pnpm --filter @worksight/mobile test` and `pnpm --filter @worksight/mobile typecheck` from the repo root.
  JUnit: `./gradlew.bat :daily-native:testDebugUnitTest` from `apps/mobile/android`.

## Review Focus

1. **The Google account is already on Daily (reinstall or second phone).** It must switch to that user and re-run
   `resyncPlus` so RevenueCat logs in as the old user. It must never strand the user on a fresh id. Covered by Task 2,
   "identity exists → switched".
2. **No anonymous session yet** (first launch offline, then online at the sign-in step). It must sign in with the id token
   directly, not fail on linkIdentity. Covered by Task 2, "no session".
3. **Double taps** on Continue with Google or Skip during sign-in. There must be one sheet and one finish. Covered by the
   Task 3 `signingIn` guard and Skip disabled while signing in. Checked on the device in Task 5.
4. **Offline at link time.** Show the offline message; the user can still skip. Covered by Task 2, "offline".
5. **Sign out** must never delete local data and must leave a working anonymous user. Covered by Task 2, "signOut", and
   the device check in Task 5.

---

### Task 1: Native `googleSignIn` in daily-native

**Files:**
- Create: `apps/mobile/modules/daily-native/android/src/main/java/expo/modules/dailynative/GoogleSignIn.kt`
- Modify: `apps/mobile/modules/daily-native/android/build.gradle` (dependencies)
- Modify: `apps/mobile/modules/daily-native/android/src/main/java/expo/modules/dailynative/DailyNativeModule.kt` (one
  AsyncFunction)
- Modify: `apps/mobile/modules/daily-native/index.ts` (type)
- Test: `apps/mobile/modules/daily-native/android/src/test/java/expo/modules/dailynative/GoogleSignInTest.kt`

**Interfaces:**
- Produces, from JS: `DailyNative.googleSignIn(webClientId: string): Promise<GoogleSignInResult>`, where
  `GoogleSignInResult = { idToken: string; rawNonce: string; email: string; name: string | null; photoUrl: string | null }`.
- It rejects with an error whose `code` is `'cancelled' | 'no_account' | 'failed'`.

- [ ] **Step 1: Write the failing JUnit test**

```kotlin
package expo.modules.dailynative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class GoogleSignInTest {
  @Test fun sha256HexMatchesKnownVector() {
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", GoogleSignIn.sha256Hex("abc"))
  }

  @Test fun nonceIsRandomAndHashed() {
    val (raw, hashed) = GoogleSignIn.nonce()
    assertEquals(64, raw.length)
    assertEquals(GoogleSignIn.sha256Hex(raw), hashed)
    assertNotEquals(raw, GoogleSignIn.nonce().first)
  }
}
```

- [ ] **Step 2: Run it and check that it fails**

Run `./gradlew.bat :daily-native:testDebugUnitTest` from `apps/mobile/android`. If `android/` is missing, first run
`cd apps/mobile && npx expo prebuild --platform android --no-install`.
Expected: the compile fails because `GoogleSignIn` is unresolved.

- [ ] **Step 3: Add the dependencies**

In `apps/mobile/modules/daily-native/android/build.gradle`, make `dependencies` read:

```gradle
dependencies {
  implementation 'com.facebook.react:react-android'
  implementation 'androidx.credentials:credentials:1.5.0'
  implementation 'androidx.credentials:credentials-play-services-auth:1.5.0'
  implementation 'com.google.android.libraries.identity.googleid:googleid:1.1.1'
  testImplementation 'junit:junit:4.13.2'
}
```

- [ ] **Step 4: Write `GoogleSignIn.kt`**

```kotlin
package expo.modules.dailynative

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.exception.CodedException
import java.security.MessageDigest
import java.security.SecureRandom

/** "Continue with Google" through Credential Manager: the system account sheet, no browser. */
object GoogleSignIn {
  fun sha256Hex(s: String): String =
    MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

  /** Raw nonce for Supabase, and its SHA-256 for Google, which signs it into the id token so the token can't be replayed. */
  fun nonce(): Pair<String, String> {
    val raw = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    return raw to sha256Hex(raw)
  }

  suspend fun signIn(activity: Activity, webClientId: String): Map<String, Any?> {
    val (raw, hashed) = nonce()
    val option = GetSignInWithGoogleOption.Builder(webClientId).setNonce(hashed).build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val result = try {
      CredentialManager.create(activity).getCredential(activity, request)
    } catch (e: GetCredentialCancellationException) {
      throw CodedException("cancelled", "Sign-in cancelled", e)
    } catch (e: NoCredentialException) {
      throw CodedException("no_account", "No Google account on this phone", e)
    } catch (e: GetCredentialException) {
      throw CodedException("failed", e.type, e)
    }
    val c = result.credential
    if (c !is CustomCredential || c.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
      throw CodedException("failed", "Unexpected credential", null)
    }
    val g = GoogleIdTokenCredential.createFrom(c.data)
    return mapOf("idToken" to g.idToken, "rawNonce" to raw, "email" to g.id, "name" to g.displayName, "photoUrl" to g.profilePictureUri?.toString())
  }
}
```

- [ ] **Step 5: Register it in `DailyNativeModule.kt`**

Add `import expo.modules.kotlin.exception.CodedException` and `import expo.modules.kotlin.functions.Coroutine` to the
imports. Then add this next to `AsyncFunction("appInfo")`:

```kotlin
    AsyncFunction("googleSignIn") Coroutine { webClientId: String ->
      val activity = appContext.currentActivity ?: throw CodedException("failed", "No activity", null)
      GoogleSignIn.signIn(activity, webClientId)
    }
```

- [ ] **Step 6: Add the JS type in `modules/daily-native/index.ts`**

Above `export type DailyNativeApi`:

```ts
export type GoogleSignInResult = { idToken: string; rawNonce: string; email: string; name: string | null; photoUrl: string | null };
```

Inside `DailyNativeApi`, after `bubbleHiddenDay(): string | null;`:

```ts
  /** Rejects with code 'cancelled' | 'no_account' | 'failed'. */
  googleSignIn(webClientId: string): Promise<GoogleSignInResult>;
```

- [ ] **Step 7: Run the JUnit tests and the typecheck**

Run `./gradlew.bat :daily-native:testDebugUnitTest` from `apps/mobile/android`.
Expected: the GoogleSignInTest tests and the existing Bubble and Events tests all pass.

Run `pnpm --filter @worksight/mobile typecheck`.
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/modules/daily-native
git commit -m "feat(mobile): native Google sign-in via Credential Manager"
```

---

### Task 2: `src/account/account.ts`, linking or switching to the Google user

**Files:**
- Create: `apps/mobile/src/account/account.ts`
- Test: `apps/mobile/src/account/account.test.ts`

**Interfaces:**
- Consumes:
  - `DailyNative.googleSignIn` (Task 1)
  - `supabase(): SupabaseClient | null` from `src/plus/supabase.ts`
  - `resyncPlus(): Promise<void>` from `src/plus/start.ts`
- Produces:
  - `type SignInResult = 'linked' | 'switched' | 'cancelled' | 'no_account' | 'offline' | 'failed'`
  - `type Account = { email: string | null; name: string | null; photoUrl: string | null }`
  - `signInWithGoogle(): Promise<SignInResult>`
  - `account(): Promise<Account | null>`
  - `signOut(): Promise<void>`
  - `firstName(a: Account | null): string`
  - `SIGN_IN_MESSAGE: Partial<Record<SignInResult, string>>`
  - `signedIn(r: SignInResult): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { getSession: vi.fn(), linkIdentity: vi.fn(), signInWithIdToken: vi.fn(), signOut: vi.fn() };
const googleSignIn = vi.fn();
const resyncPlus = vi.fn();
vi.mock('../plus/supabase', () => ({ supabase: () => ({ auth }) }));
vi.mock('../plus/start', () => ({ resyncPlus: () => resyncPlus() }));
vi.mock('../../modules/daily-native', () => ({ default: { googleSignIn: (id: string) => googleSignIn(id) } }));

import { account, firstName, signInWithGoogle, signOut } from './account';

const token = { idToken: 'tok', rawNonce: 'raw', email: 'a@b.c', name: 'Asha Rao', photoUrl: null };
const cred = { provider: 'google', token: 'tok', nonce: 'raw' };
const anon = { data: { session: { user: { id: 'anon', identities: [] } } }, error: null };
const coded = (code: string) => Object.assign(new Error(code), { code });

describe('signInWithGoogle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web.apps.googleusercontent.com';
    googleSignIn.mockResolvedValue(token);
    auth.getSession.mockResolvedValue(anon);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('links Google to the current user, keeping its id', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null });
    expect(await signInWithGoogle()).toBe('linked');
    expect(googleSignIn).toHaveBeenCalledWith('web.apps.googleusercontent.com');
    expect(auth.linkIdentity).toHaveBeenCalledWith(cred);
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(resyncPlus).not.toHaveBeenCalled();
  });

  it('identity exists → switches to that user and resyncs Plus', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: { code: 'identity_already_exists', name: 'AuthApiError' } });
    auth.signInWithIdToken.mockResolvedValue({ data: {}, error: null });
    expect(await signInWithGoogle()).toBe('switched');
    expect(auth.signInWithIdToken).toHaveBeenCalledWith(cred);
    expect(resyncPlus).toHaveBeenCalledTimes(1);
  });

  it('no session yet → signs in with the token directly', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.signInWithIdToken.mockResolvedValue({ data: {}, error: null });
    expect(await signInWithGoogle()).toBe('switched');
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    expect(resyncPlus).toHaveBeenCalledTimes(1);
  });

  it.each(['cancelled', 'no_account'])('passes %s through without touching Supabase', async (code) => {
    googleSignIn.mockRejectedValue(coded(code));
    expect(await signInWithGoogle()).toBe(code);
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it('any other native error is failed', async () => {
    googleSignIn.mockRejectedValue(coded('failed'));
    expect(await signInWithGoogle()).toBe('failed');
  });

  it('offline at link time', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: { name: 'AuthRetryableFetchError', status: 0 } });
    expect(await signInWithGoogle()).toBe('offline');
  });

  it('a thrown fetch error is offline', async () => {
    auth.linkIdentity.mockRejectedValue(new TypeError('Network request failed'));
    expect(await signInWithGoogle()).toBe('offline');
  });

  it('a rejected switch is failed and does not resync', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: { code: 'identity_already_exists', name: 'AuthApiError' } });
    auth.signInWithIdToken.mockResolvedValue({ data: {}, error: { code: 'bad_jwt', name: 'AuthApiError' } });
    expect(await signInWithGoogle()).toBe('failed');
    expect(resyncPlus).not.toHaveBeenCalled();
  });

  it('without a Web client id it fails before showing the sheet', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    expect(await signInWithGoogle()).toBe('failed');
    expect(googleSignIn).not.toHaveBeenCalled();
  });
});

describe('account and signOut', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('reads the Google identity', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u', identities: [
      { provider: 'anonymous', identity_data: {} },
      { provider: 'google', identity_data: { email: 'a@b.c', full_name: 'Asha Rao', avatar_url: 'https://x/p.png' } }
    ] } } }, error: null });
    expect(await account()).toEqual({ email: 'a@b.c', name: 'Asha Rao', photoUrl: 'https://x/p.png' });
  });

  it('an anonymous user has no account', async () => {
    auth.getSession.mockResolvedValue(anon);
    expect(await account()).toBeNull();
  });

  it('signOut clears the local session, then makes a fresh anonymous user via resync', async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(resyncPlus).toHaveBeenCalledTimes(1);
  });

  it('firstName', () => {
    expect(firstName({ email: 'a@b.c', name: 'Asha Rao', photoUrl: null })).toBe('Asha');
    expect(firstName({ email: 'a@b.c', name: null, photoUrl: null })).toBe('a@b.c');
    expect(firstName(null)).toBe('Google');
  });
});
```

- [ ] **Step 2: Run the tests and check that they fail**

Run `pnpm --filter @worksight/mobile test -- src/account`.
Expected: FAIL, because `./account` cannot be resolved.

- [ ] **Step 3: Write `account.ts`**

```ts
import DailyNative, { type GoogleSignInResult } from '../../modules/daily-native';
import { resyncPlus } from '../plus/start';
import { supabase } from '../plus/supabase';

export type SignInResult = 'linked' | 'switched' | 'cancelled' | 'no_account' | 'offline' | 'failed';
export type Account = { email: string | null; name: string | null; photoUrl: string | null };

export const SIGN_IN_MESSAGE: Partial<Record<SignInResult, string>> = {
  no_account: 'Add a Google account in your phone’s settings first.',
  offline: 'You’re offline. You can sign in later in Settings.',
  failed: 'Couldn’t sign in. Try again or skip for now.'
};

export const signedIn = (r: SignInResult) => r === 'linked' || r === 'switched';

type AuthError = { name?: string; code?: string } | null;
const isOffline = (e: unknown) => e instanceof TypeError || (e as AuthError)?.name === 'AuthRetryableFetchError';
const failure = (e: unknown): SignInResult => {
  if (isOffline(e)) return 'offline';
  console.warn('daily: Google sign-in failed', (e as AuthError)?.code ?? e);
  return 'failed';
};

/** Spec: link Google to the current (anonymous) user, so its id and with it Plus, quotas and RevenueCat stay the same.
 * A Google account already on Daily (reinstall, second phone) switches to that user instead, and Plus follows it. */
export async function signInWithGoogle(): Promise<SignInResult> {
  const sb = supabase();
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
  if (!sb || !clientId) return 'failed';
  let g: GoogleSignInResult;
  try {
    g = await DailyNative.googleSignIn(clientId);
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code === 'cancelled' || code === 'no_account' ? code : failure(e);
  }
  const cred = { provider: 'google', token: g.idToken, nonce: g.rawNonce };
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) {
      const { error } = await sb.auth.linkIdentity(cred);
      if (!error) return 'linked';
      if (error.code !== 'identity_already_exists' && error.code !== 'email_exists') return failure(error);
    }
    const { error } = await sb.auth.signInWithIdToken(cred);
    if (error) return failure(error);
    await resyncPlus(); // RevenueCat logs in as the (other) user, so Plus follows the account
    return 'switched';
  } catch (e) {
    return failure(e);
  }
}

const text = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** The signed-in Google account, or null for an anonymous user. */
export async function account(): Promise<Account | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const g = data.session?.user.identities?.find((i) => i.provider === 'google')?.identity_data;
  if (!g) return null;
  return { email: text(g.email), name: text(g.full_name) ?? text(g.name), photoUrl: text(g.avatar_url) ?? text(g.picture) };
}

/** Local data stays. Plus stays with the Google account; this phone goes back to a fresh anonymous user. */
export async function signOut(): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  await sb.auth.signOut({ scope: 'local' });
  await resyncPlus(); // ensureUserId makes the new anonymous user; billing logs in as it
}

export const firstName = (a: Account | null) => a?.name?.split(' ')[0] || a?.email || 'Google';
```

- [ ] **Step 4: Run the tests and the typecheck**

Run `pnpm --filter @worksight/mobile test -- src/account`, then `pnpm --filter @worksight/mobile typecheck`.
Expected: all the account tests pass, and the typecheck shows no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/account
git commit -m "feat(mobile): sign in with Google by linking the anonymous user, switching when the account exists"
```

---

### Task 3: Google button and the onboarding step "Keep Sunny with you"

**Files:**
- Create: `apps/mobile/src/ui/GoogleButton.tsx`
- Modify: `apps/mobile/app/onboarding.tsx`

**Interfaces:**
- Consumes: `signInWithGoogle`, `account`, `firstName`, `SIGN_IN_MESSAGE` and `signedIn` from `src/account/account.ts`.
- Produces:
  - `GoogleButton({ onPress, busy }: { onPress: () => void; busy: boolean })`
  - `GoogleG({ size }: { size: number })`

- [ ] **Step 1: Write `src/ui/GoogleButton.tsx`**

```tsx
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, F } from '../theme';

/** Google's four-colour G (branding guidelines: never recoloured). */
export function GoogleG({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/** "Continue with Google": white, 1px outline, the G and Google's own wording. */
export function GoogleButton({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel="Continue with Google" accessibilityState={{ disabled: busy, busy }}
      style={({ pressed }) => [s.btn, pressed && { transform: [{ scale: 0.97 }] }]}>
      {busy ? <ActivityIndicator color={C.ink} /> : <><GoogleG size={20} /><Text style={s.text}>Continue with Google</Text></>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 54, borderRadius: 999, backgroundColor: C.white, borderWidth: 1, borderColor: '#DADCE0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { fontFamily: F.semi, fontSize: 16, color: '#1F1F1F' }
});
```

- [ ] **Step 2: Change `app/onboarding.tsx`**

1. Imports. Change the reanimated import to
   `import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';` and add:

```tsx
import { account, firstName, SIGN_IN_MESSAGE, signedIn, signInWithGoogle } from '../src/account/account';
import { GoogleButton } from '../src/ui/GoogleButton';
```

2. `const STEPS = 4;` becomes `const STEPS = 5;`.
3. In the step 1 copy, change `Stays on this phone. No account, no cloud copy.` to `Stays on this phone. No cloud copy.`
4. Under the `goal` state, add:

```tsx
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
```

5. After the `{step === 3 && (...)}` body block, add the new body:

```tsx
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
```

6. Step 3's buttons now go on to step 4 instead of finishing. Replace the whole `{step === 3 && (<>...</>)}` button block
   with:

```tsx
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
```

7. Add a style:
   `error: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.danger, marginTop: 4 },`

- [ ] **Step 3: Run the typecheck and tests**

Run `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`.
Expected: no type errors, and every test passes.

- [ ] **Step 4: Check the file encoding**

Run `iconv -f utf-8 -t utf-8 apps/mobile/app/onboarding.tsx apps/mobile/src/ui/GoogleButton.tsx > /dev/null`.
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/ui/GoogleButton.tsx apps/mobile/app/onboarding.tsx
git commit -m "feat(mobile): onboarding ends with an optional, animated Continue with Google step"
```

---

### Task 4: Settings → Account, and the paywall sign-in line

**Files:**
- Modify: `apps/mobile/app/settings/index.tsx`
- Modify: `apps/mobile/app/paywall.tsx`

**Interfaces:**
- Consumes:
  - From Task 2: `account`, `signOut`, `signInWithGoogle`, `firstName`, `signedIn`, `SIGN_IN_MESSAGE`, `type Account`.
  - From Task 3: `GoogleG`.

- [ ] **Step 1: Settings**

Imports: add `Image` to the `react-native` import, and add:

```tsx
import { account, firstName, SIGN_IN_MESSAGE, signedIn, signInWithGoogle, signOut, type Account } from '../../src/account/account';
import { GoogleG } from '../../src/ui/GoogleButton';
```

After the `status` state and its `useFocusEffect`, add:

```tsx
  const [acct, setAcct] = useState<Account | null>(null);
  useFocusEffect(useCallback(() => { account().then(setAcct).catch(() => setAcct(null)); }, []));
  const [signingIn, setSigningIn] = useState(false);
  const [acctNote, setAcctNote] = useState<string | null>(null);
  const refreshPlus = () => { setStatus(plusStatus(db, Date.now())); setPlusNow(isPlus(db, Date.now())); };
  const google = async () => {
    if (signingIn) return;
    setSigningIn(true);
    setAcctNote(null);
    const r = await signInWithGoogle();
    if (signedIn(r)) { setAcct(await account().catch(() => null)); refreshPlus(); } else setAcctNote(SIGN_IN_MESSAGE[r] ?? null);
    setSigningIn(false);
  };
  const confirmSignOut = () => Alert.alert('Sign out?', 'Daily Plus stays with your Google account. Sign in again to get it back on this phone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => { void signOut().catch(() => {}).then(() => { setAcct(null); refreshPlus(); }); } }
  ]);
```

Insert this group right after the header `Animated.View`, and add 1 to the `i` of every later `Group` (Goals 2, Sunny 3,
Report 4, Privacy 5, Developer 6):

```tsx
      <Group i={1} label="Account">
        {acct ? (
          <>
            <View style={[s.row, { paddingVertical: 10 }]}>
              {acct.photoUrl
                ? <Image source={{ uri: acct.photoUrl }} style={s.avatar} accessibilityIgnoresInvertColors />
                : <View style={[s.avatar, s.initial]}><Text style={s.initialText}>{firstName(acct).slice(0, 1).toUpperCase()}</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.rowText}>{acct.name ?? 'Google account'}</Text>
                {acct.email ? <Text style={s.sub}>{acct.email}</Text> : null}
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={confirmSignOut} style={s.row}><Text style={s.rowText}>Sign out</Text></Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Sign in with Google" onPress={google} disabled={signingIn} style={[s.row, { paddingVertical: 10 }]}>
            <GoogleG size={20} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowText}>Sign in with Google</Text>
              <Text style={s.sub}>Keep Daily Plus if you change phones</Text>
            </View>
            {signingIn ? <ActivityIndicator size="small" color={C.ink} /> : <Icon name="forward" size={16} />}
          </Pressable>
        )}
        {acctNote ? <Text style={[s.sub, { paddingBottom: 12 }]} accessibilityLiveRegion="polite">{acctNote}</Text> : null}
      </Group>
```

Add `ActivityIndicator` to the `react-native` import. Add these styles:

```tsx
  avatar: { width: 36, height: 36, borderRadius: 18 },
  initial: { backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  sub: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 2 },
```

- [ ] **Step 2: Paywall**

Add this import:

```tsx
import { account, SIGN_IN_MESSAGE, signedIn, signInWithGoogle } from '../src/account/account';
```

Inside the component, near the other state, add:

```tsx
  const [anon, setAnon] = useState(false); // hidden until we know, so it never flashes for a signed-in user
  useEffect(() => { account().then((a) => setAnon(!a)).catch(() => {}); }, []);
  const [signNote, setSignNote] = useState<string | null>(null);
  const signIn = async () => {
    const r = await signInWithGoogle();
    if (signedIn(r)) setAnon(false); else setSignNote(SIGN_IN_MESSAGE[r] ?? null);
  };
```

Right after the footer `Animated.View` (the one with Restore · Terms · Privacy), add:

```tsx
          {anon ? (
            <Animated.View entering={rise(12)} style={s.footer}>
              <Text style={s.link}>Sign in so Plus follows you to a new phone.</Text>
              <Pressable onPress={signIn} accessibilityRole="button" style={s.footBtn}><Text style={[s.link, { color: C.ink, textDecorationLine: 'underline' }]}>Sign in</Text></Pressable>
            </Animated.View>
          ) : null}
          {signNote ? <Text style={[s.note, { marginTop: 4 }]}>{signNote}</Text> : null}
```

- [ ] **Step 3: Typecheck, tests and encoding**

Run `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`. Then run
`iconv -f utf-8 -t utf-8 apps/mobile/app/settings/index.tsx apps/mobile/app/paywall.tsx > /dev/null`.
Expected: all three pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/settings/index.tsx apps/mobile/app/paywall.tsx
git commit -m "feat(mobile): Settings account row with sign out, optional sign-in line on the paywall"
```

---

### Task 5: Checklist, release build, phone install and walkthrough

**Files:**
- Modify: `docs/superpowers/plans/2026-10-08-daily-m5-checklist.md`. Add a section "D. Sign-in" with the spec's Setup
  list, word for word, plus the Play app-signing SHA-1 note.

- [ ] **Step 1: Add the checklist section and commit**

```bash
git add docs/superpowers/plans/2026-10-08-daily-m5-checklist.md
git commit -m "docs: sign-in setup and phone checks"
```

- [ ] **Step 2: Regenerate the native project and build a release APK**

```bash
cd apps/mobile && npx expo prebuild --platform android --no-install
cd android && ./gradlew.bat assembleRelease
```

Expected: `BUILD SUCCESSFUL`. Also check that `android/app/src/main/AndroidManifest.xml` has `android:allowBackup="false"`.

- [ ] **Step 3: Install on the phone**

Ask the user before uninstalling, because it wipes Daily's data on the phone. Then run:

```bash
adb -s R85H8TTGGULF75UW uninstall com.aaronalex.daily
adb -s R85H8TTGGULF75UW install apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

If the user says no, install with `install -r`, and run the onboarding check after Settings → Delete everything.

- [ ] **Step 4: Walk through on the phone**

Take screenshots with `adb -s R85H8TTGGULF75UW exec-out screencap -p > shot.png` into the scratchpad, and read each one.
Check:
1. Onboarding shows step 5 of 5, "Keep Sunny with you", with Sunny popping in.
2. Continue with Google opens the system account sheet. After an account is picked, "Signed in as {name}" pops in and the
   app moves on to Today.
3. In the Supabase dashboard (or `execute_sql: select id, is_anonymous from auth.users`), there is one user,
   `is_anonymous = false`, with a Google identity.
4. Settings shows the photo, name and email. Sign out → the confirmation appears → the row turns back into "Sign in with
   Google". Sign in again → it is the same account, and the user count is unchanged.
5. Skip path: Delete everything → onboarding → Skip for now → Today. Settings shows "Sign in with Google".

- [ ] **Step 5: Report**

List what passed and include the screenshots. Anything that failed goes to superpowers:systematic-debugging; do not
patch it blind.
