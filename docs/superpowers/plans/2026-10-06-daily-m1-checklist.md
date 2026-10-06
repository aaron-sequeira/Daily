# Daily M1 — device checklist

Primary target: the user's Realme 7 (RMX2151, Android 12, adb serial `R85H8TTGGULF75UW`).
Alternative: emulator Pixel_9 (API 36 Google Play image), started with
`emulator.exe -avd Pixel_9 -memory 3072 -gpu swiftshader_indirect -no-snapshot-save`
(the default 2 GB RAM gets the app killed).

## Setup notes

- Install on the phone: from `apps/mobile`, `npx expo run:android --device RMX2151` (Expo takes the model name, not the adb serial). With both phone and emulator attached, pass `adb -s R85H8TTGGULF75UW ...`.
- Reset Daily on the Realme: `adb shell pm clear` and `adb shell appops set ... GET_USAGE_STATS` are refused there. Instead run `adb shell run-as com.aaronalex.daily rm -rf files/SQLite`, then force-stop and reopen Daily.
- Grant usage access on the Realme by hand: Settings → Usage access → Daily.
- Emulator alternative: `adb shell pm clear com.aaronalex.daily` and `adb shell appops set com.aaronalex.daily GET_USAGE_STATS allow` both work.
- Only touch the package `com.aaronalex.daily`.
- ColorOS may kill background apps; note anything that looks like that.

## Checks

- [ ] Fresh start (reset as above) → onboarding 3 steps → Today
- [ ] Onboarding "Open settings" → grant usage access → returning to Daily auto-advances to the goal step
- [ ] "Not now" path → Today banner + Sunny "?" + header "Paused"; granting access later clears both on return
- [ ] After granting, Today shows real data: category cards, pill filter, Sunny mood bar, timeline with the now-line; use apps for a few minutes and the numbers update within 60 s
- [ ] Phone left on a video past midnight → yesterday and today each get their share (change the clock to test)
- [ ] Force-stop Daily, use apps 20 min, wait for the background task (emulator: `adb shell cmd jobscheduler run -f com.aaronalex.daily <job-id>` with the id from `adb shell dumpsys jobscheduler | findstr daily`; phone: just wait and reopen) → reopening shows the time without a gap
- [ ] With real data, change the goal → Sunny's mood changes at once
- [ ] Category override moves an app between cards
- [ ] Export shares a JSON file; Delete everything returns to onboarding
- [ ] Accessibility → Remove animations → no rise-ins, Sunny still
- [ ] TalkBack reads Sunny's mood, tab names and the mood bar ("Mood 3 of 5")
- [ ] Database-failure screen (verified on the emulator only; not yet seen on the phone)

## Version pins

- react and react-dom are pinned to 19.2.3 in apps/web, apps/consumer and apps/agent, and via root `pnpm.overrides`, because RN 0.86 (Expo SDK 57) requires exactly 19.2.3 and `node-linker=hoisted` shares one copy.
- On an Expo SDK bump move all five places together (root overrides for react and react-dom, plus the three app pins), run `pnpm install`, then `pnpm --filter @worksight/web build`, `npx electron-vite build` in apps/consumer, and `pnpm test`.

## Database-failure trigger recipe

Temporarily append a broken SQL migration to `src/db/schema.ts`, rebuild, see the fatal screen, tap Start fresh, then revert. Never commit the broken migration.
