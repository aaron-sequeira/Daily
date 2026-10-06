# Daily — Android App with Sunny (phone screen-time coach)

**Status:** Approved (design) · **Date:** 2026-10-06 · **Owner:** Aaron · **Name:** Daily (mobile sibling of Daylens)

## 1. Overview & Goal

Daylens tells a person how they used their Windows PC. **Daily** does the same for their **Android phone**, with a buddy: **Sunny**, a sun whose mood follows today's phone time against the user's goal.

**Goal:** a user installs Daily from the Play Store, grants usage access, and from then on:
1. sees today's phone time, apps, categories, pickups and a timeline, with Sunny reacting live;
2. gets reminders (water, meals, tea, custom) and gentle coach nudges, with full-screen breaks;
3. reads a daily report and a week view, written by AI for **Daily Plus** subscribers and as a plain stats report for everyone else;
4. sees Sunny outside the app: a status-bar chip, and (Plus) a floating bubble over other apps.

## 2. Locked Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| What it is | **Standalone phone tracker + coach.** No link to the desktop app, no sync. |
| Platform | **Android only in v1.** iPhone (and its Dynamic Island) later — iOS can't read raw screen time, and testing needs a $99 Apple account plus a real iPhone. |
| Framework | **Expo** (current stable SDK, pinned at scaffold) in **`apps/mobile`** of this monorepo. Dev builds via `expo run:android` locally on Windows; no Expo Go, no EAS needed for Android. |
| Native code | **One local Expo module in Kotlin** (`apps/mobile/modules/daily-native`): usage events, the Sunny foreground service + status chip, the floating bubble. |
| Brand | **Daily.** Same sunrise logo as Daylens; the sun now has a face. |
| Buddy | **Sunny**, 5 moods (§8). Built so other buddies can be added later; v1 ships Sunny only. |
| AI writer | **Owner's OpenRouter key, server-side only.** Model `openai/gpt-6-luna` ($0.10 / $0.50 per 1M tokens), automatic fallback `google/gemini-3.1-flash-lite`. Key never ships in the app. |
| Business model | **Free + Daily Plus subscription: $3.99/month or $29.99/year, 7-day free trial**, Play regional pricing on. |
| Billing | **Google Play Billing via RevenueCat**; anonymous users (no sign-up). |
| Server | **Supabase** (new project for Daily) — anonymous auth, one Edge Function for AI, two small tables. |
| Distribution | **Google Play** (internal testing track first). |
| Testing device | **Android Studio emulator** with a Google Play system image (the user's phone is not used). |

## 3. Scope

**In scope (v1):** everything in §5–§15.

**Out of scope (v1):** iPhone / Dynamic Island / Live Activities · multiple buddies (Settings shows "more soon") · desktop ↔ phone sync · on-device AI · late-night mood penalty · forcing breaks over other apps.

**Free vs Plus**

| Free | Daily Plus |
|---|---|
| Tracking, Today, Week charts, Sunny + status chip, reminders, breaks, coach nudges, plain daily report, PDF share | AI daily report + Rewrite, AI week sentence, floating Sunny bubble |

## 4. UI Reference (approved mockups)

Canvas: **https://claude.ai/artifact/JmPUVf1cqE17ygnhgar8Gg** — the visual source of truth.

| Board | Screen |
|---|---|
| Today | Headline phone time, category pills + cards, Sunny card with 5-step mood bar, timeline |
| Daily report | "Your day, written" card, highlights, "Tomorrow, try" checklist, Share PDF / Rewrite |
| Week insights | Daily average vs last week, stacked 7-day bars, week sentence, top apps |
| Reminders | Next-up card, daily reminders, custom reminders with switches |
| Onboarding | Usage-access step with animated tap demo |
| Water break | Full-screen scene, live countdown ring, "I had some" / "Snooze" |
| Reminder notification | Lock-screen notification with action buttons; coach nudge |
| Settings | Buddy row, goals, Daily Plus (replaces the mockup's "AI provider / API key" rows), privacy |
| Sunny: the five moods / Sun buddy | Moods, thresholds, the animated Sunny drawing |
| Daily logo | Smiling sunrise icon at 176 / 64 / 44 / 28 px |
| Android: status chip + floating buddy | Chip and bubble with speech nudge |
| iPhone: Dynamic Island | **Reference only** — post-v1 |

**Tokens** (same as Daylens): background `#FBF8F4`, panel `#F2EBE6`, ink `#171717`, muted `#77716C`, line `#E7DFD8`; categories — Social `#F4C6C8`, Messages `#CFE6FB`, Fun `#F9DDB9`, Learning `#BFEBD3`, Work `#D8D2FC`, Other `#E9E3DD`. Font **DM Sans** bundled with the app (works offline). Cards 20–24 px radius, pills full-round. Bottom tabs: Today · Report · Week · Reminders; Settings from the Today header.

**Motion:** Reanimated. Staggered rise-in (18 px, `cubic-bezier(.22,.8,.26,1)`, ~0.7 s), pills slide in, bars grow (Week bars with spring `cubic-bezier(.2,1.3,.35,1)`), Sunny's ring/meter pop, springy press scale 0.95, notification-style drop-ins. Respect the system "remove animations" setting (`AccessibilityInfo.isReduceMotionEnabled`): no entrance/loop motion, keep fades.

## 5. Architecture

```
apps/mobile (Expo, TypeScript)
├─ app/                     expo-router: (tabs)/today|report|week|reminders, settings, onboarding, break, paywall
├─ src/
│  ├─ db/                   expo-sqlite schema + migrations + queries
│  ├─ tracking/             ingest(): native events → sessions/pickups; categories
│  ├─ sunny/                moodFor(), <Sunny mood size/> (react-native-svg + Reanimated)
│  ├─ reminders/            scheduling via expo-notifications; phone-time reminder checks
│  ├─ coach/                nudge rules + manners gate (pure)
│  ├─ report/               buildReportInput(), plainReport(), week math (pure); client for the AI function
│  └─ plus/                 RevenueCat setup, entitlement, paywall
├─ modules/daily-native/    Kotlin Expo module (usage events, SunnyService, bubble)
└─ assets/sunny/            5 mood PNGs + status-bar outline, generated from the Sunny SVG

packages/core               shared: date helpers; reminder types/validation (moved from apps/consumer/src/shared/reminders.ts, old path re-exports)
supabase-daily/             Supabase project for Daily: migrations + functions/daily-ai (Deno)
```

- **Shared with desktop:** `@worksight/core/date` and the reminder types/validation only. Desktop report/coach code is built on PC windows and screen reads, so the phone has its own simpler modules. `core`'s `complete()` is **not** used: the server talks to OpenRouter directly because it needs OpenRouter-only options (fallback models, provider data policy).
- **Monorepo:** Metro resolves workspace packages. If Metro cannot resolve under pnpm's isolated layout, use Expo's documented pnpm setup for `apps/mobile` only — never a repo-wide change that would break Electron's native rebuilds.
- **Package id:** `com.aaronalex.daily` (permanent once uploaded to Play).
- **Dev loop:** Android Studio emulator (Google Play image) → `pnpm --filter @worksight/mobile android` (= `expo run:android`) → Metro hot reload. A debug-only "Seed a sample day" action in Settings fills the DB for UI work.

## 6. Data Model (SQLite on the phone)

| Table | Columns | Notes |
|---|---|---|
| `sessions` | `id`, `package`, `start_ms`, `end_ms`, `day` (local `YYYY-MM-DD`) | Foreground app spans; split at local midnight |
| `pickups` | `ts_ms`, `day` | One per unlock |
| `apps` | `package` PK, `label`, `category`, `user_category` NULL, `icon_png` | Label/icon from PackageManager, cached |
| `ingest_state` | `last_event_ms` | Ingestion cursor |
| `mood_log` | `day`, `ts_ms`, `mood` | Mood changes through the day (for the report) |
| `reminders`, `reminder_state` | as desktop's shape (shared types) | |
| `water_log` | `ts_ms`, `day` | "I had some" taps |
| `nudges` | `id`, `kind`, `ts_ms`, `status` | For the manners gate and snooze |
| `reports` | `day` PK, `kind` (`ai`/`plain`), `json`, `created_ms` | Plan-item done flags live in `json` |
| `weeks` | `week_start` PK, `sentence`, `created_ms` | |
| `settings` | `key` PK, `value` | goal (default 240 min), wind-down (23:00), write time (21:00), retention (90 days), bubble, service on/off |

Retention sweep runs once a day. Settings → Export writes a JSON of all tables via the share sheet; Delete everything drops all tables and re-runs onboarding.

## 7. Tracking

- **Source:** `UsageStatsManager.queryEvents(from, to)` in Kotlin, returning plain records: `ACTIVITY_RESUMED`/`ACTIVITY_PAUSED` (package, time), `SCREEN_INTERACTIVE`/`SCREEN_NON_INTERACTIVE`, `KEYGUARD_HIDDEN` (unlock → pickup).
- **Ingest** (`tracking/ingest.ts`, pure over a list of events + cursor): pairs resume/pause per package into sessions, closes open sessions at screen-off, splits at local midnight, drops ignored packages (launcher, System UI, Daily itself), writes sessions/pickups, advances the cursor. Idempotent: re-ingesting the same window produces no duplicates.
- **When:** on app foreground; every 60 s inside SunnyService (§9.3) when it runs; every 15 min via `expo-background-task` as a backup. Android keeps raw events only a few days — anything older than that when ingestion resumes is shown as "no data", never estimated.
- **Phone time** = sum of session minutes for the day. **Time zones:** local days follow the device zone (same rule as desktop: day keys computed in the current zone).
- **Categories:** Android `ApplicationInfo.category` (SOCIAL→Social, VIDEO/AUDIO/GAME→Fun, PRODUCTIVITY→Work, NEWS/MAPS/IMAGE→Other) → overridden by a built-in list of popular packages (WhatsApp/Telegram/Gmail→Messages, Duolingo→Learning, …) → overridden by the user (Settings → App categories).
- **App visibility:** a `<queries>` entry for launcher intents makes user apps visible to PackageManager; **no `QUERY_ALL_PACKAGES`** (Play-restricted).
- **Privacy:** only package names, labels, icons and times are stored. No notification text, messages or screen content — ever.

## 8. Sunny

**Mood rule** (`sunny/mood.ts`, pure): `ratio = phoneMinutesToday / goalMinutes`.

| ratio | < 0.5 | 0.5 – < 0.8 | 0.8 – < 1.0 | 1.0 – < 1.3 | ≥ 1.3 |
|---|---|---|---|---|---|
| mood | `glowing` | `happy` | `alright` | `fading` | `sad` |
| stage (user's three) | Perfect | Perfect | Could do better | Losing light | Losing light |

Goal default 4h (editable 1–12 h). Days reset at local midnight. Mood changes are written to `mood_log`; there is **no** notification on a mood change.

**Parity:** `sunny/mood.cases.json` holds ~20 `(minutes, goal) → mood` cases including every boundary. The TS test and a Kotlin JVM test both run it, so the service's twin of `moodFor` can't drift.

**Drawing:** `<Sunny mood size />` ports the mockup's `Sun.dc.html` SVG (glow, rays, body, cheeks, blinking eyes, brows, mouth, tear, cloud, sparkles; per-mood colours and ray count/length). Loops in Reanimated: rays spin (glowing 22 s, happy 40 s, others still), bob, blink every ~4.6 s, glow pulse, tear drop, cloud drift. A mood change cross-fades over 600 ms with a little squash. The "can't see" state (usage access off) shows Sunny with a neutral face and a "?".

**Outside the app:** `scripts/sunny-assets.mjs` renders the same SVG to 5 PNGs (bubble, notification large icon) and a single-colour outline PNG (status-bar small icon — Android tints status-bar icons one colour, so the chip shows Sunny's outline + time, not the colour face).

**Buddy seam:** screens take a `buddy` id from settings and render through `buddies/index.ts` (`{ sunny: { Component, moods, assets } }`). One entry in v1; adding a buddy later is a new entry, no screen changes.

## 9. Reminders, Breaks, Service, Nudges

### 9.1 Reminders
- Built-ins (shared types, desktop defaults): **Water** every 60 min of phone time · **Lunch** 13:00 Mon–Fri, 30-min break · **Tea** 16:00 Mon–Fri, 5-min break · **Dinner** 19:30 daily, off. Custom: time + days, or every N min of phone time; break length or "just a nudge".
- **Clock reminders** are scheduled with `expo-notifications` (weekly triggers per weekday, local time) so they fire with the app closed; all are rescheduled on app foreground, on time-zone change (detected by the service and on foreground) and on edit. Exact timing needs `SCHEDULE_EXACT_ALARM`; without it they may be a few minutes late.
- **Phone-time reminders** are checked by SunnyService each minute; with the service off, by the 15-min background task (up to 15 min late).
- Notification actions: **I had some** (writes `water_log`, resets the water counter), **Take a break** (opens the break screen), **Snooze 15 min**.

### 9.2 Breaks
Full-screen in-app screen (route `break?kind=&seconds=`): scene per kind ported from the desktop break scenes (water, meal, tea, stretch), live countdown + ring, primary "I had some" / "I'm back", secondary "Snooze 15 min". Opened from a notification or the Reminders tab. Never drawn over other apps.

### 9.3 SunnyService (Kotlin foreground service)
- On by default after onboarding; switch in Settings. Type `specialUse` (declared to Play: "shows the user's live screen time and buddy").
- Every 60 s: query today's events since its own cursor, compute phone time + mood (Kotlin `moodFor`), update the ongoing notification = **status chip** (small icon: Sunny outline; text: phone time; on Android 16+ posted as a promoted ongoing "Live Update", else a low-importance pinned notification; expanded view shows the colour Sunny + mood line), emit an event to JS when the app is open, run phone-time reminder and nudge checks (§9.4) via a headless JS task.
- Restarts after reboot (`RECEIVE_BOOT_COMPLETED`). Settings → "Keep Sunny running" explains battery-optimisation exemptions per OEM.

### 9.4 Coach nudges (pure rules over the last hour of sessions + settings + clock)
- **Long stretch:** ≥ 30 min continuous in one Social or Fun app → "30 minutes on {App}. A good spot to stop?" — once per stretch.
- **Goal points:** once at 80 % ("{m} left before your goal") and once at 100 % ("You've reached your goal for today").
- **Wind-down:** first phone use after wind-down time (default 23:00) → one gentle note per night.
- **Manners gate:** ≤ 1 nudge per 20 min; none while a call, navigation or music app is in front (package list + Android category MAPS/AUDIO); every nudge has "Snooze 1 h" (silences all nudges for an hour).
- Delivery: a notification, or Sunny's speech bubble when the floating bubble is on.

### 9.5 Floating bubble (Plus)
`SYSTEM_ALERT_WINDOW` overlay owned by SunnyService: a 66 px circle with the current mood PNG, draggable, snaps to the nearest edge, tap opens Daily, long-press → "Hide for today". Speech bubble for nudges with two actions. Off by default; turning it on asks for "Display over other apps". Hidden automatically while a full-screen app (video, game) is in front.

## 10. Daily Report & Week

### 10.1 Report input (`report/input.ts`, pure)
`{ day, goalMin, phoneMin, pickups, apps: [{ name, category, minutes, opens }] (top 12), categories: {cat: minutes}, hourly: number[24], longest: { app, minutes, start }, moods: [{ mood, at }], water, last7: [{ day, phoneMin }], yesterdayPlan: [{ text, done }] }` — names and numbers only.

### 10.2 Plain report (free, and every fallback)
Built locally from the same input: headline ("A calmer day: 2h 48m, 34 minutes under your average"), highlights (quietest stretch, most opened, longest scroll, after wind-down), and two template "Tomorrow, try" items picked by rule (e.g. longest scroll → "Leave {App} after 20 minutes"). Same screen, no "Your day, written" paragraph.

### 10.3 AI report (Plus)
- **When:** at "Write it at" (default 21:00) the background task builds the input and calls the server; on success it saves the report and notifies "Your day is ready". If the OS skipped the task, it runs on next app open. **Rewrite** calls again (limited, §11).
- **Server** builds the prompt (you-voice, warm, no judgement, every number must come from the input) and requests JSON: `{ headline: string ≤ 120, story: string ≤ 600, tomorrow: [string ≤ 80, string ≤ 80] }`. Highlights stay computed locally.
- **Validation (server):** schema check, then a number-grounding check — every number/duration in the text must match a value derivable from the input (reuse the desktop's grounding helpers if they are pure; else port them). Failure → one retry → `{ error: 'invalid' }` → the app shows the plain report.
- **Week:** Monday-start weeks. Charts computed locally. Plus gets one AI sentence per week (`{ sentence ≤ 200 }`), cached in `weeks`; free gets a computed sentence ("Down 22m a day vs last week").
- **PDF:** `expo-print` renders the report HTML → `expo-sharing`.

## 11. Daily Plus: Billing & AI Server

- **Identity:** Supabase anonymous sign-in on first launch; its user id is the RevenueCat app user id. No email, no password.
- **Purchase:** `react-native-purchases` (RevenueCat) with Play Billing; products `plus_monthly` ($3.99) and `plus_yearly` ($29.99), 7-day free trial offer, entitlement `plus`. Paywall screen reached from Report/Week upsell cards, the bubble switch and Settings → Daily Plus (plan, renewal date, Restore purchases, Manage in Play).
- **Offline:** the last known entitlement is cached; Plus stays on offline until RevenueCat's cached info expires.
- **Function `daily-ai`** (Supabase Edge Function, Deno):
  1. verify the Supabase JWT;
  2. check entitlement via RevenueCat REST (`GET /v1/subscribers/{id}`), cached 10 min in table `entitlements(user_id, plus, checked_at)`;
  3. rate limit via table `ai_usage(user_id, day, reports, rewrites, weeks)`: 1 auto report + 3 rewrites per day, 1 week sentence + 2 rewrites per week;
  4. accept only `{ kind: 'report' | 'week', input }` validated by schema, body ≤ 32 KB — **no free-form prompt**, so the key can't be used as a general chatbot;
  5. call OpenRouter chat completions with `models: ['openai/gpt-6-luna', 'google/gemini-3.1-flash-lite']`, `response_format: json_schema`, `provider: { data_collection: 'deny' }`, `max_tokens: 900`, reasoning effort low, 25 s timeout;
  6. validate (§10.3) and return `{ ok, json }` or `{ ok: false, error: 'not_plus' | 'limit' | 'invalid' | 'failed' }`.
- **Secrets:** `OPENROUTER_API_KEY` and `REVENUECAT_SECRET` set with `supabase secrets set` (value copied from `apps/consumer/.env`'s `OPEN_ROUTER_APIKEY` by the user or at deploy time; never committed, never in the app). Model ids live in function config so they change without an app release.
- **Cost:** ~40 calls/user/month × ~3k in + ~600 out ≈ **$0.03/user/month**.

## 12. Permissions & Onboarding

Onboarding (4 steps, as the mockup): Welcome + Sunny → **Usage access** (Settings intent; "Not now, just reminders" allowed) → goal (default 4h) → notifications + Sunny service. Asked later, in context: exact alarms (first clock reminder), overlay (bubble switch), battery exemption help (Settings). Without usage access the app runs in reminders-only mode: Today shows a "Turn on usage access" card, Sunny shows the "can't see" state.

## 13. Error Handling

| Situation | Behaviour |
|---|---|
| Usage access revoked | Detected on foreground and by the service; banner + "can't see" Sunny; tracking pauses, nothing invented |
| Service killed by OS/OEM | Next ingest catches up from events; gaps older than Android's event retention show as "no data" |
| Background task skipped | Report/ingest/reminder reschedule run on next foreground |
| AI: offline / timeout / `failed` | Plain report + "Couldn't write today's story. Retry" line; silent retry on next open |
| AI: `not_plus` | Plain report + upsell card |
| AI: `limit` | Plain/previous report stays; "You've used today's rewrites" |
| AI: `invalid` | Plain report (server already retried once) |
| Purchase errors | RevenueCat error mapped to a one-line message; never blocks free features |
| Notification permission denied | Reminders tab shows a card to enable it; reminders stay listed |
| DB migration failure | Abort launch into a "Something went wrong — Export / Reset" screen; never drop data silently |

## 14. Testing

- **Vitest (apps/mobile, pure TS):** `moodFor` + `mood.cases.json`; `ingest` (pairing, screen-off close, midnight split, idempotency, ignored packages); categories precedence; reminder scheduling (weekly triggers, time-zone change, phone-time counters); nudge rules + manners gate; `buildReportInput`, `plainReport`, week math.
- **Kotlin JVM tests:** event → record mapping; `moodFor` against `mood.cases.json`.
- **Edge Function (Deno test):** auth, entitlement cache, rate limits, schema rejection (free-form prompt refused), fallback model on error, grounding failure → retry → `invalid`; OpenRouter and RevenueCat mocked.
- **Emulator checklists per phase**, using adb: `appops set com.aaronalex.daily GET_USAGE_STATS allow`, `cmd notification`, time/zone changes, `am kill` to test service restart, Doze (`dumpsys deviceidle force-idle`).
- **Billing:** Play internal testing track + license testers; RevenueCat sandbox.
- Existing desktop tests stay green after moving the reminder types into core (`pnpm test`).

## 15. Build Phases (each gets its own implementation plan)

| Phase | Delivers |
|---|---|
| **M1 Skeleton, tracking, Today, Sunny** | `apps/mobile` scaffold in the monorepo, theme/fonts/tabs, SQLite + migrations, Kotlin usage-events module, ingest + categories, Today screen, `<Sunny>` + `moodFor` + parity cases, onboarding, Settings basics (goal, retention, categories, export/delete, debug seed) |
| **M2 Reminders & breaks** | Reminder types moved to core, Reminders tab + editor, notification scheduling + actions, break screen + scenes, water log |
| **M3 SunnyService, chip, nudges** | Foreground service, status chip (+ Live Update on 16+), 60 s ingest, phone-time reminders, nudge rules + gate, Kotlin mood twin, Sunny PNG/outline assets, boot restart, keep-running help |
| **M4 Reports & Week** | Report input, plain report, Report + Week screens, PDF share, `daily-ai` function with OpenRouter (Plus check stubbed to allow in dev), scheduled writing, Rewrite |
| **M5 Daily Plus** | Supabase anon auth, RevenueCat + Play Billing, paywall + upsells, real entitlement + rate limits in the function, floating bubble (Plus) |
| **M6 Polish & release** | Smiling-logo icon generator + adaptive icon, motion pass, privacy policy, Play listing, data-safety form, internal testing release |

## 16. Risks

- **OEM background killing** (Xiaomi, Samsung, Oppo…) can stop SunnyService: catch-up ingest keeps data correct; nudges are best-effort; help screen per OEM.
- **Play policy reviews** for usage-access, `specialUse` foreground service and overlay permissions: clear in-app explanations and Play declarations in M6; the bubble is optional so a rejection can't block the core app.
- **Model churn / quality:** model ids are server config; switching needs no app update.
- **pnpm + Metro:** resolved in M1 without changing the desktop's install layout.
- **Name "Daily"** is generic: the Play listing title can carry a subtitle (e.g. "Daily: screen time with Sunny"); the package id is fixed regardless.
