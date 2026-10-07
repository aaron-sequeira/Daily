# Daily M5: Daily Plus checklist

## A. On the emulator now (debug build, no keys, so the fake billing is used)
- [ ] Every source file decodes as UTF-8: `for f in $(git ls-files 'apps/mobile/**/*.ts*'); do iconv -f UTF-8 -t UTF-8 $f >/dev/null || echo $f; done` prints nothing
- [ ] Settings → Daily Plus · Try 7 days free opens the paywall; the screen matches the "Daily Plus paywall" mockup
- [ ] Yearly is picked first with SAVE 37% and the trial timeline; picking monthly changes the day-7 label and the fine print
- [ ] "Start 7-day free trial" closes the paywall; the Report tab now has Rewrite; Settings shows "Your subscription · Day 1 of 7 · Yearly plan"
- [ ] Your subscription matches the mockup: trial bar, Today rows (story, rewrites left, week sentence), Manage in Google Play, Restore
- [ ] The Report "See Daily Plus" and Week "Daily Plus writes this for you" upsells show only when not on Plus
- [ ] Floating Sunny: the switch asks for overlay access; the bubble appears outside Daily within a minute, hides while Daily is open, drags and snaps, tap opens Daily, long-press → Hide for today keeps it away until tomorrow
- [ ] A coach nudge arrives as Sunny's speech card while the bubble shows; "Snooze 1 h" silences nudges

## B. Go live (needs your accounts; do once, in this order)

1. **Supabase**: create a project "daily" (region near India).
   - Authentication → Sign In / Providers → turn on **Anonymous sign-ins**.
   - Authentication → Rate limits: keep anonymous sign-ins limited (or turn on CAPTCHA).
   - From the repo root:
     - `supabase init --workdir supabase-daily` (once)
     - `supabase link --workdir supabase-daily --project-ref <ref>`
     - `supabase db push --workdir supabase-daily`
2. **Google Play Console** ($25 one-time developer account):
   - Create the app `com.aaronalex.daily`.
   - Monetize → Subscriptions: create `plus_monthly` and `plus_yearly`.
   - Give each a base plan (monthly at $3.99 / yearly at $29.99, regional pricing on) and a **7-day free trial** offer for new customers.
   - Billing products only load for a build uploaded to a testing track. Upload a signed release AAB (`cd apps/mobile/android && ./gradlew.bat bundleRelease`; signing is set up in M6) to **Internal testing**, and add yourself as a licence tester.
3. **RevenueCat**:
   - Create a project.
   - Keep Project settings → Restore behaviour on **Transfer to new App User ID**.
   - Add an Android app with package `com.aaronalex.daily`, and upload the Play service-account JSON (RevenueCat's guide walks through it).
   - Import both products.
   - Create entitlement **plus** with both products attached.
   - Make the **default** offering's packages Monthly (`$rc_monthly` → plus_monthly) and Annual (`$rc_annual` → plus_yearly).
   - Copy the **public Android SDK key** (`goog_…`) and a **secret API key** (`sk_…`).
4. **Secrets**:
   - `supabase secrets set --workdir supabase-daily OPENROUTER_API_KEY=… REVENUECAT_SECRET=sk_…`
   - Copy the OpenRouter value yourself from `apps/consumer/.env`. Never paste it into chat or a file in the repo.
   - In the OpenRouter dashboard, give the key a monthly credit limit.
5. **Deploy**: `supabase functions deploy daily-ai --workdir supabase-daily`.
6. **Check the gate**:
   - (a) In the function's Logs, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are present. If the project disabled the legacy JWT keys, re-enable them or update the function.
   - (b) `curl` `POST <SUPABASE_URL>/rest/v1/rpc/use_ai` with the anon key fails. With the service key it returns true; use a real anonymous user's id from Authentication → Users as `p_user` (a random uuid fails the foreign key), e.g. body `{"p_user":"<id>","p_bucket":"check","p_limit":1}`. Then `POST <SUPABASE_URL>/rest/v1/rpc/refund_ai` with the service key and `{"p_user":"<id>","p_bucket":"check"}` to give the slot back.
   - (c) `curl` the `daily-ai` function with only the anon key returns 401.
7. **App env**: in `apps/mobile/.env` (gitignored), set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`

   Remove `EXPO_PUBLIC_DAILY_AI_URL` so the app uses the deployed function. Rebuild.

## C. On your phone with the internal-testing build
- [ ] The paywall shows Play's real prices in your currency, and the trial only if your account hasn't had one
- [ ] Buy the trial with the licence tester account → Plus turns on; tonight's report is the written story
- [ ] Rewrite 3 times → the 4th says "You've used today's rewrites"
- [ ] Rewrite a report from 30 days ago → works (old days can be rewritten)
- [ ] Switch to yearly on a monthly subscription → Play shows one subscription (yearly) afterwards.
- [ ] In Play, cancel the subscription → it stays on until the period ends, and Your subscription says "ends …"
- [ ] Tap the 'Your free week ends soon' notification → opens Your subscription
- [ ] Airplane mode with Plus → still Plus until it ends; nothing crashes
- [ ] Delete everything, then Restore purchases → Plus comes back
- [ ] curl the function with only the anon key → 401; with a free user's token → not_plus
- [ ] Floating Sunny over Instagram shows; over YouTube or a game it hides within a minute
- [ ] Rotate: with Daily in the background (not swiped away) and Floating Sunny on, open a landscape app (YouTube full-screen excluded, it hides the bubble; use Chrome or Photos) → the bubble stays on screen at an edge
- [ ] Reboot with Floating Sunny on, don't open Daily → the bubble appears within a minute after unlocking
- [ ] Still open from M2–M4: run those checklists on this build

## D. Sign-in (Google)

Setup, once:
- [ ] Supabase → Authentication → Sign In / Providers: **Anonymous sign-ins** on; **Google** on with the Web client ID (`827080583200-0ncj…`, "Daily webAuth") and its client secret (typed in the dashboard, never in chat); "Skip nonce checks" off
- [ ] Supabase → Authentication → Settings: **Allow manual linking** on (`linkIdentity` needs it)
- [ ] Google Cloud: the Android OAuth client ("Daily", `2bgb…`) is for `com.aaronalex.daily` with SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (debug.keystore, which also signs today's release builds)
- [ ] After the first Play upload: add Play Console → App integrity → App signing key SHA-1 as a second Android OAuth client, or sign-in fails for Play-installed copies

On the phone:
- [ ] Fresh onboarding → step 5 "Keep Sunny with you" → Continue with Google → account sheet → "Signed in as …" → Today
- [ ] Supabase `auth.users`: still one user for this phone, `is_anonymous = false`, with a Google identity
- [ ] Settings shows photo, name, email; Sign out → confirm → "Sign in with Google" row; sign in again → same user
- [ ] Skip for now → Today; Settings offers "Sign in with Google"
- [ ] Reinstall → sign in with the same Google account → switched to the earlier user; Plus back after Restore
