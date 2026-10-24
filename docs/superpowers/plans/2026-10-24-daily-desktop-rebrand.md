# Daily for desktop — Project 1: Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The desktop app, its installer, the website, the README and the intro video say **Daily** and show the Daily
mark (Sunny over the horizon, as on the phone). Everything else looks and behaves exactly as before, and existing
Daylens users keep their data.

**Architecture:** User-visible text changes and the logo generator draws the Daily mark. Internal identifiers stay as
they are, so the change set stays small and safe: the `DaylensSettings` type, the `window.daylens` bridge,
`daylens.sqlite`, `DAYLENS_MODEL_DIR`, `DaylensFg` in the OCR helper, and the `appId`. A one-time startup step moves
`%APPDATA%\Daylens` to `%APPDATA%\Daily`. A test stops "Daylens" leaking back into anything a user can read.

**Tech Stack:** Electron, React, TypeScript, Vitest, electron-builder (NSIS), static website (`website/`), the
showreel's Electron renderer (`marketing/showreel`, not committed).

**Spec:** `docs/superpowers/specs/2026-10-24-daily-desktop-design.md` (Goal 1, "Rebrand scope", "Website URL unchanged").

## Global Constraints

- **Name:** "Daily" everywhere a user can see it (window, tray, taskbar, installer, Start menu, dialogs, pop-ups, exports,
  website, README).
- **Logo:** the phone app's mark (`apps/mobile/src/ui/Logo.tsx`): ink tile `#171717`, a filled sun `#F6B35E` with
  Sunny's eyes and smile `#3A2412`, five rays, and a cream `#FBF8F4` horizon.
- **Design unchanged:** layout, colours, type and motion stay as they are, including the logo's draw-in animation.
- **Website URL unchanged:** `aaron-sequeira.github.io/Daylens/…`. No repo rename.
- **Never stage** `.codex/` or `marketing/`. The video source is not committed.
- **Ruling (deviates from the spec):** the `appId` stays `ai.worksight.daylens`, so the new installer upgrades the old
  install in place (same uninstall entry, same taskbar group, same login-item registry value). The spec's
  `com.aaronalex.daily.desktop` would install a second app beside the old one. Cost if wrong: one config line.

## Review Focus

1. **An existing user updates:** their history, reports, models and settings must all be there after the update.
   That covers the folder move, a new empty `Daily` folder created by an early write, and the move failing because a
   file is locked.
2. **Start-at-login after the update** points at the new exe. Its registry value is keyed by the unchanged
   AppUserModelId and rewritten at every startup.
3. **The uninstaller's "also delete my data"** removes `%APPDATA%\Daily`, and `%APPDATA%\Daylens` if it is left over.
4. **Website download buttons:** they point at `Daily-Setup.exe`, so the site must only deploy after a release
   carrying that file exists.
5. **Screen readers** announce "Daily", via the logo's aria-label and the window title.

---

### Task 1: Move Daylens data to Daily on first launch

**Files:**
- Create: `apps/consumer/src/main/migrate.ts`
- Test: `apps/consumer/src/main/migrate.test.ts`
- Modify: `apps/consumer/src/main/index.ts:73-74`: `app.setName('Daily')`, keeping `setAppUserModelId`. Call the
  migration before `setName`'s userData is first used, i.e. before `openDatabase` and any `app.getPath('userData')`.

**Interfaces:**
- Produces:
  ```ts
  migrateUserData(appData: string, fs?: Pick<typeof import('node:fs'), 'existsSync'|'readdirSync'|'renameSync'|'cpSync'|'rmSync'>): 'moved' | 'copied' | 'none'
  ```
  It moves `<appData>/Daylens` to `<appData>/Daily`.

- [ ] **Step 1: Failing tests** (real temp folders, `os.tmpdir()`):
  - `moves Daylens to Daily when Daily does not exist` → returns `'moved'`; `Daily/daylens.sqlite` exists; `Daylens` is
    gone.
  - `also moves when Daily exists but is empty` (an early write created it) → `'moved'`.
  - `does nothing when Daily already has data` → `'none'`; `Daylens` is untouched.
  - `does nothing for a fresh install` (no `Daylens`) → `'none'`.
  - `falls back to copy when rename fails` (inject an `fs` whose `renameSync` throws `EPERM`) → `'copied'`;
    `Daily/daylens.sqlite` exists; `Daylens` is kept.
- [ ] **Step 2:** Run `pnpm --filter @worksight/consumer exec vitest run src/main/migrate.test.ts`. Expected: FAIL (module
  missing).
- [ ] **Step 3: Implement.** "Has data" means the folder exists and isn't empty. For an empty `Daily`, remove it, then
  rename. On a rename error, `cpSync(..., { recursive: true })` and keep the original.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run the full consumer test suite (`pnpm --filter
  @worksight/consumer test`). Expected: PASS.
- [ ] **Step 5:** Commit: `feat(desktop): Daily name; move %APPDATA%\Daylens to Daily on first launch`.

### Task 2: Daily everywhere a user reads it

**Files:**
- Test: `apps/consumer/src/brand.test.ts`
- Modify: every user-visible "Daylens" in `apps/consumer/src/**`, including:
  - tray tooltip and menu ("Open Daily")
  - export dialog title and file name (`daily-export-<date>.json`)
  - utility `serviceName` ("Daily Brain", "Daily Writer")
  - the test pop-up text
  - onboarding content
  - the Settings, Privacy, Model, Screen prompt, Today and TitleBar copy
  - `pill.css` comments are not user-visible: leave them
  - report share and PDF text
  - `packages/core/src/ai/complete.ts`'s `title` default
- Also update tests that assert the old strings: `onboardingContent.test.ts`, `report.test.ts`, `share.test.ts`,
  `reader.test.ts`, `complete.test.ts`.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Failing test** `brand.test.ts`, `no user-facing "Daylens" left`:
  - Scan `src/**/*.{ts,tsx,css,html}` and `resources/*.nsh` (not `*.test.ts`).
  - Fail on any line matching `/Daylens/` unless the match is one of the internal identifiers:
    `DaylensSettings`, `window.daylens`, `daylens.sqlite`, `DAYLENS_MODEL_DIR`, `DaylensFg`, `ai.worksight.daylens`.
  - Report the file and line.
- [ ] **Step 2:** Run `pnpm --filter @worksight/consumer exec vitest run src/brand.test.ts`. Expected: FAIL, listing the
  files above.
- [ ] **Step 3:** Replace the strings ("Daylens" → "Daily"; "daylens-export" → "daily-export"). Keep every sentence the
  same apart from the name.
- [ ] **Step 4:** Run the consumer test suite and `pnpm --filter @worksight/core test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(desktop): say Daily everywhere a user can read it`.

### Task 3: The Daily mark (logo, icons, tray)

**Files:**
- Modify: `apps/consumer/scripts/logo/sunrise.mjs`; `scripts/logo/sunrise.test.ts`; `src/renderer/components/Logo.tsx`
- Regenerate (by script, never by hand):
  - `src/renderer/components/logoPaths.ts`
  - `resources/logo-full.svg`, `resources/logo-small.svg`
  - `resources/icon.png`, `resources/icon.ico`
  - `resources/tray.png`, `resources/tray@2x.png`

**Interfaces:**
- Produces: `LogoMark` gains
  ```ts
  sun: { cx: number; cy: number; r: number }
  face: { eyes: string; smile: string }
  ```
  Both variants use the phone mark's geometry: rays `M19.01,48.92 … 92.19,42.23`, horizon `M14,67 … 86,66.5`, sun
  `cx 50, cy 64, r 21` clipped at `y 64`, eyes `M43.5 52 L43.5 54 M56.5 52 L56.5 54` (width 3.8), smile
  `M44.8 57.6 Q50 61.4 55.2 57.6` (width 2.8).

- [ ] **Step 1: Failing test** in `sunrise.test.ts`, `draws the Daily mark`:
  - `markSvg(FULL)` contains a filled circle `cx="50" cy="64" r="21"` with fill `#F6B35E`.
  - It contains the eyes and smile paths with stroke `#3A2412`.
  - The rays and horizon equal the phone's paths above.
- [ ] **Step 2:** Run `pnpm --filter @worksight/consumer exec vitest run scripts/logo`. Expected: FAIL.
- [ ] **Step 3:** Change `sunrise.mjs` to emit that geometry for both variants. Keep `COLORS`.
- [ ] **Step 4: `Logo.tsx`**
  - Draw the filled sun inside the existing `dl-sun` group, so it rises with the current animation.
  - Fade in the face after the sun: add a `dl-face` class next to the existing `dl-sun`/`dl-r` classes in `styles.css`,
    with the same timing pattern.
  - Set the aria-label to `'Daily'`.
  - The existing animation tests (`lib/logo` tests) must still pass.
- [ ] **Step 5:** Run `pnpm --filter @worksight/consumer logo`, then the consumer tests. Expected: the icon files change;
  the tests PASS. Open `resources/icon.png` and check it matches the phone app icon.
- [ ] **Step 6:** Commit: `feat(desktop): the Daily mark in the app, icons and tray`.

### Task 4: Installer and packaging say Daily

**Files:**
- Modify:
  - `apps/consumer/electron-builder.yml`: `productName: Daily`, `nsis.name: daily`,
    `artifactName: Daily-Setup-${version}.${ext}`, `shortcutName: Daily`; keep `appId`; update the comment on lines 4–5
    about userData.
  - `resources/installer.nsh`: the question reads "Also delete your Daily history…"; delete `$APPDATA\Daily` and
    `$APPDATA\Daylens`.
  - `scripts/stable-installer.mjs`: `Daily-Setup.exe`.
  - `scripts/installer-config.test.ts`.
- Bump `apps/consumer/package.json` version to `1.1.0`.

- [ ] **Step 1: Update `installer-config.test.ts` first**, asserting:
  - the productName, artifactName, shortcutName and nsis name above
  - `appId` is still `ai.worksight.daylens`
  - the uninstall script deletes both folders

  Run it. Expected: FAIL.
- [ ] **Step 2:** Make the config changes.
- [ ] **Step 3:** Run the consumer tests, then `pnpm --filter @worksight/consumer dist` and its `check-build`. Expected:
  PASS; `release/Daily-Setup-1.1.0.exe` exists. (Close any running Daylens first: shared single-instance lock.)
- [ ] **Step 4:** Commit: `build(desktop): Daily installer 1.1.0 (upgrades Daylens in place)`.

### Task 5: Website and README

**Files:**
- Modify:
  - `website/index.html`: title, meta, brand text and alt texts; download links to
    `releases/latest/download/Daily-Setup.exe`
  - `website/main.js`
  - `website/assets/logo.svg`: the Daily mark, from `resources/logo-small.svg`
  - `scripts/check-site.mjs`
  - `README.md`
- Regenerate `website/assets/og.png` (1200×630): render the site's hero with the new name and logo, using the same
  Electron hidden-window capture approach as `scripts/logo/render.cjs`. Add it as `scripts/og.cjs`.
- Screenshots in `website/assets/daylens-*.png`: retake them from the rebranded app (title bar shows "Daily"), keeping
  the file names. Their content is unchanged.

- [ ] **Step 1:** Update `check-site.mjs` to require "Daily" in the title, brand and download link, and to reject
  "Daylens" outside the URL path `/Daylens/` and asset file names. Run `node scripts/check-site.mjs`. Expected: FAIL.
- [ ] **Step 2:** Make the copy and asset changes.
- [ ] **Step 3:** Run `node scripts/check-site.mjs`. Expected: `check-site OK`.
- [ ] **Step 4:** Commit: `feat(website): Daily name and mark`.
  - Note for the user: deploy (merge to `main`) only after a GitHub release with `Daily-Setup.exe` exists.

### Task 6: Intro video (local only, not committed)

**Files:**
- Modify `marketing/showreel/`: `cues.js` text, `scenes-a.js`/`scenes-b.js` name and logo, and the logo drawing used by
  scenes (use `resources/logo-full.svg` paths).
- Replace two feature beats: the screen-reading beat and one other, keeping their cue lengths.
  - **The Island:** a dark pill drops from the top centre and expands to "You've watched 2h 10m of YouTube today".
  - **The Replay ribbon:** coloured chapters slide in and one opens.

  Visuals follow the canvas mockups. Timing comes from the same cue sheet, so the audio stays in sync.
- Output:
  - re-render with `render.cjs` to `marketing/showreel/out/`
  - copy the web MP4 and GIF teaser to `website/assets/daily-showreel.mp4` and `daily-showreel-teaser.gif`
  - update `website/index.html` and README links
  - delete the old `daylens-showreel*` assets

- [ ] **Step 1:** Render and check frames 0, 15 s, 30 s and 45 s visually (name, logo, the Island beat, the Replay beat).
- [ ] **Step 2:** `node scripts/check-site.mjs` → OK. Commit only the website and README changes:
  `feat(website): Daily showreel`.

## Self-review

- **Spec coverage:** rename (Tasks 2 and 4), logo (3), data move (1), website and URL unchanged (5), video (6). The app
  ID is a ruling (see Global Constraints).
- **Not in this project:** BYOK removal, the Island, Replay, Plus (projects 2–4).
