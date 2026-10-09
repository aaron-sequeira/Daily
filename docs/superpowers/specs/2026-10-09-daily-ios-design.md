# Daily for iPhone (App Store)

Builds on the Daily mobile spec (2026-10-06-daily-mobile-app-design.md), M5 (Daily Plus), the sign-in design
(2026-10-08-daily-sign-in-design.md) and everything shipped on Android since. Goal: a proper, working iPhone version of
Daily, published on the App Store. Test device: the user's iPhone 15 (Dynamic Island, iOS 17+).

## Decisions (agreed in brainstorming)

- **Data model:** Apple's Screen Time report shown inside Daily, plus Daily's own layer built on milestone events. iOS
  never lets Daily read per-app usage; Daily knows phone time only in steps.
- **Dynamic Island is Sunny's home on iPhone:** progress, reminders (water, lunch, tea, dinner, custom), breaks and "report ready".
- **Server-driven:** the Island is started and updated by pushes from Supabase (push-to-start, iOS 17.2+). Reminders
  always also work as normal local notifications, so nothing depends on the server or a connection.
- **Architecture:** one Expo app. Shared JS, a Swift side for `daily-native`, three iOS extensions, platform-split tracking.
  Built and submitted with EAS (no Mac).

## 1. Screen Time

**Permission (onboarding step 2 on iPhone):**
- Request Family Controls authorization (individual). This is Apple's prompt with Face ID or the passcode.
- Then the "What counts?" picker (FamilyActivityPicker), preselected to all categories, which the user can untick.
- The selection is stored in the App Group.

**Today (iPhone):**
- **Top half:** phone time headline, category cards, top apps and the hourly timeline. It's rendered by the **Screen Time
  report extension** (DeviceActivityReport) in SwiftUI, styled like Daily (DM Sans, the cream/ink palette, category
  colours, 22 px card radius). Its data never leaves the extension.
- **Bottom half:** the shared React Native view (Sunny card, water, the reminders strip).

**Milestones:** the **Screen Time monitor extension** (DeviceActivityMonitor) watches the selection daily:
- events at each 10% of the goal, and at each full hour of phone time (for water)
- on each event:
  - write `{ step, at }` to App Group storage
  - set Sunny's mood (the same `moodFor` thresholds as Android)
  - POST `/milestone` to `ios-push` with the user's token, stored in the App Group

**Phone time on iPhone:** the highest milestone reached today. Shown as "about 2h" in the shared UI, while the exact
figure appears only inside the report view.

**Week:** daily totals from the milestones (to the nearest step), plus the AI week sentence.

## 2. Dynamic Island and Live Activity

One Live Activity, **"Sunny today"**, built in a widget extension from the canvas board Island.dc.html:

| State | Compact | Expanded and Lock Screen | Buttons (App Intents, no app launch) |
|---|---|---|---|
| progress | Sunny (mood) · "2h 10m" (milestone figure) | mood line, progress bar, minutes left | — |
| reminder | icon · "now" or countdown | Sunny with the reminder message | Take a break, Done, Snooze 15m |
| break | Sunny breathing · live timer | the break colour and a countdown bar | End break |
| report | Sunny with a pen · "Ready" | "Your day is written" with the headline, or "Tap to write today's story" | — |

- **After a reminder or break,** the activity goes back to progress.
- **Button presses** update the activity locally and POST `/done` or `/snooze` so the server doesn't repeat them.
- **Lifetime:**
  - push-to-start at the first milestone of the day or 07:00 local, whichever is first
  - restarted before iOS's 8-hour limit
  - ended at wind-down, after "report ready" has shown
- **Settings switch** "Sunny in the Dynamic Island": on by default after onboarding.
- **Fallbacks:** with the Island off or a push missing, reminders and report-ready arrive as normal notifications. When
  offline, timers continue and the rest keeps its last state.

## 3. Server pushes (`ios-push` Edge Function)

**From the phone (iPhone only; to be added to the privacy policy):**
- push-to-start token and activity update token
- the reminder schedule (name, message, time, days, break length)
- goal, wind-down time, report time and time zone, re-sent on every change
- milestone pings (step only)

**Tables** (RLS on, own rows only, service role for the function):
- `ios_devices (user_id, start_token, activity_token, tz, updated_at)`
- `ios_schedule (user_id, json, updated_at)`
- `ios_pushes (id, user_id, kind, due_at, sent_at)` for idempotency

**Routes:**
- `/sync`, `/milestone`, `/done` and `/snooze`: user JWT.
- `/tick`: run every minute by pg_cron + pg_net with the service key. It sends what is due: morning start, clock reminders
  (in local time, skipped if already marked done), the restart before 8 h, report-ready at the report time, and the end
  at wind-down.

**Apple:** the APNs HTTP/2 API with a .p8 key, stored as the secret `APNS_KEY` (plus key id and team id). A token Apple
rejects (410) is deleted. Every push carries an `ios_pushes` id, so retries never show a reminder twice.

**Water:** sent from the hour milestones, respecting the water reminder's on/off switch.

## 4. Sign-in, payments and differences

**Sign-in (iPhone):**
- **Sign in with Apple:** expo-apple-authentication with a nonce, then Supabase `linkIdentity` / `signInWithIdToken`,
  with the same link-or-switch rules as Google on Android. The button goes at the top of onboarding step 5 and in
  Settings → Account.
- **Email:** the existing sheet.
- **Google:** Supabase OAuth in an ASWebAuthenticationSession (expo-web-browser).
- **Setup:** the Supabase Apple provider, using the bundle id as client id.

**Daily Plus (iPhone):**
- A RevenueCat App Store app, with products `plus_monthly` and `plus_yearly` (7-day free trial) on the same `plus`
  entitlement, so Plus is cross-platform per account.
- "Manage in Google Play" becomes "Manage in App Store".
- The paywall shows Apple's required Terms and Privacy links. **A Terms page is needed** and is built in i6.

**Features that differ:**
- The status-bar chip becomes the Dynamic Island.
- Floating Sunny is hidden on iPhone (no iOS equivalent); Plus there means the AI stories and rewrites.
- "Keep Sunny running" is hidden.
- Usage access and the totals fallback are replaced by Screen Time.

Everything else is shared: breaks, reminders, Report, Week, PDF, export and delete, and the intro, which continues from
the iOS launch screen.

**The AI story (iPhone):** a separate, smaller input kind `report_ios` in `contract.ts`, with grounding and limits:
- goal and the milestone timeline
- mood check-ins, water, breaks and yesterday's plan
- no app names

## 5. Build, test, ship

**EAS Build and Submit:**
- The app id `com.aaronalex.daily` gets capabilities for Family Controls, App Groups (`group.com.aaronalex.daily`), Push
  Notifications and Sign in with Apple.
- Extensions are added with `@bacons/apple-targets`; Screen Time APIs come via `react-native-device-activity` where it
  fits.
- **Family Controls (Distribution) entitlement:** requested from Apple at the start of i1. Development builds work
  without it; TestFlight and the App Store don't.

**Tests:**
- **Vitest:**
  - the platform split
  - `report_ios` input and contract
  - `ios-push` scheduling: due reminders, time zones, done/snooze, idempotency, 8-hour restart, 410 cleanup
  - the milestone maths
- **Swift:** kept thin, checked on the iPhone 15 with a checklist.
- **Android:** must not regress (existing tests green, plus an Android build check).

**Phases (each ends with a working build):**
1. **i1:** EAS iOS builds on the iPhone, shared screens, iOS layout.
2. **i2:** Screen Time: permission, the report view as Today, milestones, mood.
3. **i3:** Live Activity, all four states and buttons, driven from the app.
4. **i4:** `ios-push`, the scheduler, reminders and report-ready while Daily is closed.
5. **i5:** Apple sign-in, App Store payments, the iPhone AI story.
6. **i6:** App Store listing, screenshots, privacy labels, review notes, the Terms page, submission.

**From the user:**
- an Expo account
- Apple ID login for EAS (interactive)
- the Family Controls request (text drafted)
- the APNs .p8 key (saved to a local file, never pasted)
- iPhone registration via `eas device:create`

## Out of scope

- iPad
- Home Screen widgets
- Screen Time blocking or shielding of apps
- macOS
- Android changes beyond what the shared code needs
