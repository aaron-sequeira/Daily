# Daily for desktop: rebrand, Island, Replay and Plus

Mockups (Claude Design canvas): https://claude.ai/artifact/9wsFfJPmoCdJxcr6nRPuXA. The boards are The Island (interactive),
What the Island notices, Replay your day (interactive), Memory game (interactive), and Habits & changes.

## Intent

**Why the app exists:** Daily lets you **look back on your day and know what you actually did**, so you can retrace
your steps:
- what you worked on
- where the time went
- where you left something
- what you saw

The desktop app (today "Daylens", `apps/consumer`, Electron) becomes **Daily**, the desktop sibling of the Daily phone
app. It earns money through **Daily Plus**, the same subscription as on the phone.

**What success looks like:**
- Someone installs Daily, never signs up, and can still replay yesterday afternoon chapter by chapter, with the
  screenshots and pages they saw.
- Someone who wants more pays once and gets the same Plus on their PC and their phone.

## Goals

1. **Rebrand** Daylens → Daily on the desktop app, the website and the intro video. Keep the design; change the name
   and logo (Sunny, the sunrise mark from the phone app).
2. **Free and fully local, no account.** Everything recorded stays on the PC, and any local model the user picks writes
   the reports. This is how Daylens works today.
3. **New free features:**
   - **The Island:** a pill at the top centre of the screen that drops down with things worth saying, and takes
     follow-up questions.
   - **Replay:** the day as chapters, with the screenshots and the titles and thumbnails of what the user saw.
4. **Daily Plus on desktop:**
   - an account (only when the user wants Plus)
   - payment through Stripe
   - one entitlement shared with the phone
   - unlocks:
     - the cloud AI with deeper understanding: window titles and redacted on-screen text, for sharper insights and
       Island answers, and AI stories on PCs that can't run a local model
     - the Memory game
     - Habits & changes
   - marketed as "advanced insights and better tracking".

## Non-goals

- macOS (still deferred).
- Syncing the day between devices. The phone and the PC each keep their own day; only the subscription is shared.
- An account for free users, or any free-tier data leaving the PC.

## Anti-goals (fail even if it works)

- A free user is pushed to sign up, or anything about a free user's day leaves the PC.
- A screenshot ever leaves the PC.
- The Island nags: it should speak rarely and only when it has something worth saying.
- The rebrand changes the look (layout, colours, typography stay as they are).

## Free vs Plus (decided by the user)

| Feature | Free (local, no account) | Plus (account + subscription) |
|---|---|---|
| Tracking, Today, reports, PDF, search | yes, any local model | yes |
| **The Island** (moments, follow-up questions) | **yes**, local model | answers improved by the cloud AI |
| **Replay** (chapters, screenshots, "what you saw") | **yes** | richer chapter stories via the cloud AI |
| **Memory game** | no | **yes** |
| **Habits & changes** | no | **yes** |
| Cloud AI (OpenRouter through Daily's server) | no | **yes**: reads window titles and redacted screen text; writes the stories when the PC can't run a local model |

## How it works (the parts the user decided)

- **One subscription:**
  - Plus bought on iPhone, Android or desktop unlocks every device signed in to the same Daily account.
  - It's the existing Supabase account and RevenueCat `plus` entitlement (project `projb6cfd2b5`), with the RevenueCat
    app user id = the Supabase user id, as on the phone.
- **Desktop payment through Stripe.**
- **Account only for Plus:** the free app never asks.
- **What you saw:** screenshots of the screen during the day **and** the titles and thumbnails of the videos and pages
  opened, both kept on the PC.
- **Local stays local:** every free feature, the Island and Replay included, runs on the PC with the user's local model.

## Builder's calls (mine, open to change)

- **Payment:** RevenueCat Web Billing (Stripe connected in RevenueCat). The desktop opens a RevenueCat web purchase
  link for the signed-in user, and the purchase lands on the same `plus` entitlement. "Manage" opens RevenueCat's
  customer portal. Same prices as the phone: monthly, and yearly with a 7-day trial.
- **Desktop sign-in:**
  - email with a 6-digit code, the same Supabase email flow as the phone
  - Google and Apple can come later
  - the session is kept with Electron `safeStorage`
- **Plus check on desktop:** RevenueCat's REST API through the existing `daily-ai` function, which already verifies
  Plus. The desktop caches the result offline, as the phone does.
- **Cloud AI:**
  - Plus requests go through the existing `daily-ai` Supabase function (OpenRouter key on the server, quotas,
    entitlement check), with a desktop request kind.
  - The current "bring your own API key" cloud mode is removed (decided by the user).
- **Screen text to the cloud (Plus only):**
  - an explicit opt-in switch, off by default, explained in plain words
  - text goes through the existing `redact()` and the user's exclusion patterns first
  - screenshots themselves never leave the PC
- **Screenshots:**
  - Captured on the existing screen-reader schedule: the same moments it already captures for text.
  - Stored as compressed thumbnails (about 960 px wide, WebP or JPEG) in the profile folder.
  - Under the same exclusions and private-window rules as text.
  - Kept for the screen-text retention setting (1, 7 or 30 days).
  - Deleted with Delete everything.
- **The Island:**
  - a frameless, always-on-top, transparent Electron window at the top centre of the primary display
  - resting pill: today's total and the current focus
  - drops down for a few moment types:
    - frequent returns to a place
    - a habit forming
    - a personal best
    - a break due
    - the day being ready
  - at most a few times an hour, with quiet hours and a Settings switch
  - follow-up questions are answered from the day's local data by the local model (cloud with Plus)
- **Replay chapters:** built from the existing day episodes (`report/episodes.ts`). Chapter stories come from the
  writer (local, or cloud with Plus).
- **Memory game:** three questions a day, generated from the day's data (orders, counts, times), with a streak.
- **Habits & changes:** detected from 4 weeks of local history:
  - new recurring patterns
  - fading ones
  - shifts in timing
  - streaks
  - things worth a look

  The detection runs locally; Plus is the gate.
- **Rebrand scope:**
  - app name, `productName`, window titles, tray, installer, icons (the Sunny mark), website copy and logo, README
  - the `appId` changes to `com.aaronalex.daily.desktop`
  - existing Daylens data is migrated from `%APPDATA%\Daylens` on first launch
- **Intro video (`marketing/showreel`, not committed):**
  - same structure and timing
  - swap name and logo
  - replace two feature beats with the Island dropping down and the Replay ribbon
  - re-render

## Order (four projects, each shippable)

1. **Rebrand:** app, website, video.
2. **Free features:** the Island and Replay with screenshots, all local.
3. **Plus on desktop:** sign-in, Stripe via RevenueCat, entitlement, cloud AI through `daily-ai`, screen-text opt-in.
4. **Plus features:** the Memory game, and Habits & changes.

## Constraints

- Windows only, the existing Electron app and its tests, and the existing `pnpm` monorepo.
- The repo is public: no keys in it. Server secrets live in Supabase (project `yasjfblbspokiuulktrm`).
- The privacy policy and website must be updated before Plus on desktop ships: screen text to the cloud, and
  screenshots kept locally.
- Free users: no network calls about their day.

## More builder's calls (from the builder check)

- **Desktop AI server:**
  - A new Supabase function `daily-desktop`, separate from `daily-ai`, so the phone's names-and-numbers contract stays
    as it is.
  - Plus-only, with its own quotas: a daily ceiling on Island questions and stories. It accepts redacted titles and
    screen text, capped in size.
  - The privacy policy gains a desktop section.
- **The Island replaces the old pop-ups:**
  - The Island replaces the existing pill pop-ups (`windows/pill.ts`). Coach moments (breaks, wins, focus, reminders,
    tips) become Island moments, and their settings move over.
  - The full-screen break overlay stays.
  - One system, so nothing double-pops.
- **"Pages and videos you saw":** the page or video name comes from the window title, and the thumbnail is cropped from
  the local screenshot. No browser history, no extension, no network.
- **Website URL unchanged:** `aaron-sequeira.github.io/Daylens/…`, so links in the shipped phone apps keep working.
  Only the site's copy and logo change.

## Decided by the user (after the builder check)

1. **"Bring your own API key" is removed.**
   - On a PC that can't run a local model, a free user gets no AI stories: Today, Replay chapters, search and the plain
     (non-AI) report still work.
   - AI stories there come only with Plus.
   - Keys already saved are deleted from the PC's secret store on update, and the user is told once.
2. **Screenshots are a separate switch, off until the user turns it on.**
   - It's asked during onboarding, after the screen-text step, in plain words: kept on this PC only, for Replay,
     deleted after the retention period.
   - Existing users are asked once after the update.
   - Screen reading (text) keeps its own existing switch.
   - Without screenshots, Replay still shows chapters, titles and stats, with placeholders in place of images.
   - Captures cover the foreground window, as today.
