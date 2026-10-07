# Daily: account sign-in (Google now, Apple with iOS)

Builds on the Daily mobile spec (2026-10-06-daily-mobile-app-design.md) and M5 (Daily Plus). M5 gives every install an
anonymous Supabase user; RevenueCat is logged in as that user and the daily-ai function checks Plus by that user id.

## Goal

Let people keep their Daily Plus subscription and identity across phones and reinstalls, with a sign-in that feels like
part of onboarding, not a gate.

- Optional and prompted: onboarding ends with a sign-in step that can be skipped. Nothing in the app needs an account.
- Google on Android via the system account sheet (no browser). Apple on iOS: designed now, built in the iOS phase.
- "SSO" means social sign-in only. No email/password, no magic links, no enterprise SSO.
- Data stays on the phone. Signing in does not upload reports or usage; it only names the user.

## Approach

Google Credential Manager in our own Kotlin module (`modules/daily-native`), plus Supabase `linkIdentity` /
`signInWithIdToken`.

Rejected: `@react-native-google-signin` (free tier uses the deprecated Google Sign-In SDK); thoughtbot social-auth (one more
dependency for ~80 lines of Kotlin); Supabase browser OAuth (Chrome tab bounce, not smooth).

## Pieces

### 1. Native: `DailyNative.googleSignIn(webClientId, hashedNonce)`

Kotlin in daily-native, using `androidx.credentials` + `com.google.android.libraries.identity.googleid`:
`GetSignInWithGoogleOption(serverClientId = webClientId).setNonce(hashedNonce)` → `CredentialManager.getCredential`.

Resolves `{ idToken, email, name, photoUrl }`. Rejects with one of these codes:
- `cancelled`: the user closed the sheet.
- `no_account`: there is no Google account on the phone.
- `failed`: anything else.

The Web client ID comes from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Google matches the Android OAuth client by package name and
signing SHA-1, so no Android client ID is in the code.

### 2. JS: `src/account/account.ts`

- `signInWithGoogle()`:
  1. Make a random raw nonce and its SHA-256 (hex) with `expo-crypto`, which Expo already ships.
  2. Get the Google id token through the native module, passing the hashed nonce.
  3. Call `linkIdentity({ provider: 'google', token, nonce: raw })` on the current anonymous session. The user id is kept,
     so Plus, quotas and RevenueCat need no change.
  4. If Supabase answers `identity_already_exists`, the Google account belongs to an earlier Daily user (a reinstall or a
     second phone). Call `signInWithIdToken({ provider: 'google', token, nonce: raw })` to switch to that user. Then run
     `billing.logIn(newId)` and `resyncPlus()`, so Plus follows the account. The abandoned anonymous user is left alone;
     it owns nothing.
  5. Return `{ status: 'linked' | 'switched' | 'cancelled' | 'no_account' | 'offline' | 'failed' }`.
- `account()`: `{ email, name, photoUrl } | null` from the session's Google identity. It is null for an anonymous user.
- `signOut()`: `supabase.auth.signOut()`, then `ensureUserId()` makes a fresh anonymous user, then `linkUser`. Local data is
  untouched.

Each step that needs only a single call or a clear failure is a function of injected deps (native, supabase, billing), so
it can be unit tested like `start.ts`.

### 3. Onboarding: a new last step, "Keep Sunny with you"

- The step comes after the goal step, so onboarding has 5 steps.
- Sunny pops in, glowing (scale spring, the existing `pop`/`rise` motion).
- A card rises with the copy "Your reports stay on this phone. Sign in so Daily Plus follows you to a new phone."
- The primary button is "Continue with Google". It follows Google's branding: the G mark, white surface, a 1px outline and
  "Continue with Google" text.
- "Skip for now" is a text link below the button.
- While signing in, the button shows a spinner. On success, Sunny's mood changes to happy, a check pops in and the step
  says "Signed in as {first name}". After ~900 ms onboarding finishes.
- On error, a one-line message appears under the button and the button stays enabled:
  - `no_account`: "Add a Google account in your phone's settings first."
  - `offline`: "You're offline. You can sign in later in Settings."
  - `failed`: "Couldn't sign in. Try again or skip for now."
- `cancelled` shows nothing.
- Reduced motion turns the animations off, as everywhere else.
- iOS later: an Apple button sits above Google, following Apple's guidelines. Not built now.

### 4. Settings → Account (top group)

- Signed in: the photo (or initial), name and email, then "Sign out". Sign out asks for confirmation: "Daily Plus stays
  with your Google account. Sign in again to get it back on this phone."
- Not signed in: a row reading "Sign in with Google" with the sub-line "Keep Daily Plus if you change phones". Tapping it
  runs the same flow inline.

### 5. Paywall

When the user isn't signed in, a quiet line sits under the plans: "Sign in so Plus follows you to a new phone", with a
"Sign in" link. It is never required to buy.

## Setup (user, Supabase dashboard, one time)

- Authentication → Sign In / Providers:
  - Anonymous sign-ins: on.
  - Google: on, with the Web client ID and the Web client secret. The secret is typed by the user into the dashboard, never
    put in chat.
  - Skip nonce checks: off.
- Authentication → Settings: "Allow manual linking": on. `linkIdentity` needs this.
- Google Cloud:
  - The Android OAuth client is for `com.aaronalex.daily` with SHA-1
    `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (debug.keystore, which also signs the current release
    builds).
  - Later, add the Play app-signing SHA-1 as a second Android client.

## Testing

- Unit (Vitest), with fakes for the native module, the Supabase client and billing:
  - linked
  - identity exists → switched, plus RevenueCat logIn and a resync
  - cancelled
  - no_account
  - offline
  - signOut makes a new anonymous user
  - `account()` reads the Google identity
- Kotlin: none. It is a thin wrapper over Credential Manager and is checked on the device.
- Phone (Realme 7), on a release build:
  - Fresh install → onboarding → Continue with Google → the sheet shows → signed in, and the Supabase user id is unchanged
    (check in the dashboard: same user, now with a Google identity).
  - Skip, then sign in later from Settings.
  - Sign out, then sign in again → the account is the same as the first time.
  - Reinstall → sign in → switched to the earlier user; Plus is back after Restore.

## Out of scope

- Apple sign-in code (iOS phase).
- Account deletion in-app. Delete everything stays local; deleting the server user is an M6 item, which Play needs at
  publish.
- Moving reports between phones (sync is deferred).
