# Daily for desktop — Project 2: The Island and Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two free, fully local features.
- **The Island:** a pill at the top centre of the screen, showing today's time and current focus, that drops down with
  moments worth saying and answers follow-up questions with the local model.
- **Replay:** the day as chapters, with what you saw (window titles and, if the user turns them on, screenshots kept on
  the PC).

**Architecture:**
- **The Island is the existing pop-up system, moved and restyled.** It reuses the pill window manager
  (`windows/pill.ts`, queue and action semantics already tested) and the coach engine (cooldowns, "fewer", snooze,
  quiet hours), at a new place (top centre), with a resting pill state and a new look.
- **New moments are coach `Rule`s.** Follow-up answers are one new local-writer call.
- **Replay builds on what is already recorded:**
  - chapters are grouped from today's episodes (`report/episodes.ts`)
  - screenshots are a new capture mode of the OCR helper, behind their own switch, stored as JPEG files under userData
  - the screenshots are served to the renderer through a locked-down `daily-shot:` protocol

**Tech Stack:** Electron 33, React, TypeScript, Vitest, better-sqlite3, PowerShell OCR helper, node-llama-cpp writer.

**Spec:** `docs/superpowers/specs/2026-10-24-daily-desktop-design.md`. This plan covers project 2, "Free features": the
Island and Replay with screenshots, all local. Builder's calls apply: "The Island", "Replay chapters", "Screenshots",
"Pages and videos you saw", and the user's decision 2.

## Global Constraints

- **Free and local:** no account, and no network call about the user's day. Everything stays on the PC.
- **Screenshots:**
  - their own switch `screenshots`, off by default
  - asked once during onboarding (after the screen-text step) and once for existing users
  - never leave the PC
  - foreground window only
  - same exclusions and private-window rules as screen text
  - kept for `rawTextRetentionDays` (1, 7 or 30), then deleted
  - deleted by Delete everything
- **Screenshot files:** JPEG, about 960 px on the long side, quality 70, at `<userData>/shots/<YYYY-MM-DD>/<at>.jpg`.
- **The Island:**
  - top centre of the primary display's work area
  - never takes keyboard focus (`showInactive`, click-through except on hover, as the pill does today)
  - speaks rarely: moments go through the existing coach gate and its settings, which keep working
  - Ctrl+Alt+D still dismisses everything
- **Copy:** plain words, sentence case, no emoji, in Daily's existing voice.
- **Design unchanged elsewhere.** The Island and Replay follow the canvas mockups (boards "The Island" and "Replay
  your day"), using the app's existing CSS variables.

## Review Focus

1. **Excluded or private windows must never be screenshotted,** including a window that switches mid-capture. *Pinned
   by:* Task 2 test "discards a shot of a window that changed or is excluded".
2. **No screenshot is taken while the switch is off,** even with screen reading on, and the reverse. *Pinned by:* the
   Task 2 reader tests.
3. **`daily-shot:` must never serve a file outside `<userData>/shots`,** including `..` and encoded traversal. *Pinned
   by:* the Task 3 test "refuses paths outside the shots folder".
4. **A PC with no local model:** the Island still shows moments, but offers no follow-up questions, rather than chips
   that fail. *Pinned by:* the Task 7 test "offers questions only when a local model can answer".
5. **Retention deletes old screenshot files as well as rows,** and Delete everything removes the whole folder. *Pinned
   by:* the Task 2 retention test.

---

### Task 1: The OCR helper can return a screenshot

**Files:**
- Modify: `apps/consumer/resources/ocr-helper.ps1`. Add the commands `"<id> SHOT"` (capture only) and
  `"<id> CAPTURE+SHOT"` (OCR plus image).
- Modify: `apps/consumer/src/main/ocr/client.ts`
- Test: `apps/consumer/src/main/ocr/client.test.ts`

**Interfaces:**
- Produces:
  - `OcrClient.capture(opts?: { text?: boolean; shot?: boolean }): Promise<CaptureResult | null>`. Defaults to
    `{ text: true, shot: false }`, which is today's behaviour.
  - `CaptureResult` gains `jpg?: string` (base64).
  - `text` is `''` when `text: false`.

- [ ] **Step 1: Failing tests** in `client.test.ts`, with the existing fake child:
  - `sends CAPTURE+SHOT and returns the jpg when both are asked`
  - `sends SHOT and returns text '' when only a shot is asked`
  - `default capture() still sends CAPTURE`
- [ ] **Step 2:** Run `pnpm --filter @worksight/consumer exec vitest run src/main/ocr`. Expected: FAIL.
- [ ] **Step 3: The helper.**
  - `Capture-Foreground` also returns the JPEG: `$src` scaled to at most 960 px on the long side, saved with a JPEG
    encoder at quality 70 (`System.Drawing.Imaging.Encoder.Quality`), as `jpg = [Convert]::ToBase64String(...)`.
  - The loop branches on `CAPTURE`, `SHOT` and `CAPTURE+SHOT`.
  - The window-changed and hung-window guards stay ahead of every branch.
- [ ] **Step 4: The client.** Map the options to the command, and pass `jpg` through.
- [ ] **Step 5:** Run the same command. Expected: PASS. Commit: `feat(desktop): the OCR helper can return a small
  screenshot`.

### Task 2: Screenshots: switch, capture, storage, retention

**Files:**
- Modify: `apps/consumer/src/main/settings.ts`
  - add `screenshots: false` and `screenshotsAsked: false` to `DEFAULT_SETTINGS`
  - add `screenshots: z.boolean()` and `screenshotsAsked: z.boolean()` to `settingsPatch`
- Create: `apps/consumer/src/main/screen/shots.ts`
- Modify: `apps/consumer/src/main/screen/reader.ts`, plus the Delete everything handler in `src/main/index.ts`
- Test: `apps/consumer/src/main/screen/shots.test.ts`, `apps/consumer/src/main/screen/reader.test.ts`

**Interfaces:**
- Produces, in `shots.ts`:
  ```ts
  export const SHOTS_SQL: string; // CREATE TABLE IF NOT EXISTS screen_shots (at INTEGER PRIMARY KEY, date TEXT NOT NULL, app TEXT NOT NULL, title TEXT, file TEXT NOT NULL)
  export function createShotStore(db: Database, dir: string): {
    save(s: { at: number; date: string; app: string; title: string | null; jpg: string }): void; // writes <dir>/<date>/<at>.jpg, then the row
    forDay(date: string): { at: number; app: string; title: string | null; file: string }[];
    purgeBefore(ms: number): number; // deletes files and rows; returns the count
    deleteAll(): void;               // rm -rf <dir>, drop rows
  };
  ```
- The reader:
  - `reader.tick()` calls `ocr.capture({ text: s.screenReading, shot: s.screenshots })`, or skips when both are off.
  - It stores text only when `screenReading` is on, and calls `shots.save` only when `screenshots` is on and `cap.jpg`
    is present.

- [ ] **Step 1: Failing tests.**
  - `shots.test.ts` (temp dir, in-memory DB, as the other store tests do):
    - `saves the file and the row`
    - `purgeBefore deletes old files and rows, keeps new ones`
    - `deleteAll removes the folder`
  - `reader.test.ts`:
    - `takes no screenshot while the switch is off, even with screen reading on`
    - `takes a screenshot without OCR when only screenshots are on`
    - `discards a shot of a window that changed or is excluded`: same checks as the text path
- [ ] **Step 2:** Run `pnpm --filter @worksight/consumer exec vitest run src/main/screen`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - The reader's start condition becomes `(s.screenReading || s.screenshots) && s.consentGranted && !s.trackingPaused`.
  - The existing `runRetention` also calls `shots.purgeBefore`.
  - Delete everything calls `shots.deleteAll()`.
- [ ] **Step 4:** Run `pnpm --filter @worksight/consumer test`. Expected: PASS. Commit: `feat(desktop): screenshots for
  Replay, off until turned on, local only`.

### Task 3: Chapters, the replay data and the `daily-shot:` protocol

**Files:**
- Create: `apps/consumer/src/main/replay/chapters.ts`
- Create: `apps/consumer/src/main/replay/shotProtocol.ts`
- Modify: `apps/consumer/src/main/ipc.ts` and `src/preload/index.ts`. Add the channel `replay:day`, validated with zod
  like the others.
- Modify: `src/main/index.ts`: register the protocol, and handle `replay:day`.
- Test: `apps/consumer/src/main/replay/chapters.test.ts`, `apps/consumer/src/main/replay/shotProtocol.test.ts`

**Interfaces:**
- Consumes: `Episode` from `report/episodes.ts`, and `createShotStore` from Task 2.
- Produces:
  ```ts
  export interface Chapter { id: string; start: number; end: number; category: string; title: string; apps: { app: string; minutes: number }[];
    seen: string[]; switches: number; }
  export function buildChapters(episodes: Episode[]): Chapter[];
  export function shotPath(dir: string, url: string): string | null; // daily-shot://<date>/<at>.jpg → absolute path, or null if outside dir
  // IPC replay:day(date: YYYY-MM-DD) → { chapters: Chapter[]; shots: { at: number; app: string; title: string | null; url: string }[]; screenshots: boolean; asked: boolean }
  ```
- Chapter rules:
  - Consecutive episodes merge while their category stays the same and gaps are under 10 minutes.
  - A chapter shorter than 10 minutes folds into its longer neighbour.
  - `title`: the top app by minutes, then " · " and its most frequent window title, cut to 60 characters.
  - `seen`: the unique window titles, at most 8.
  - `switches`: the number of app changes inside the chapter.

- [ ] **Step 1: Failing tests.**
  - `chapters.test.ts`:
    - `merges same-category episodes across short gaps`
    - `folds a chapter under 10 minutes into its neighbour`
    - `titles a chapter by its top app and title`
    - `counts app switches`
    - `an empty day gives no chapters`
  - `shotProtocol.test.ts`:
    - `maps daily-shot://2026-10-22/123.jpg into the shots folder`
    - `refuses paths outside the shots folder`, checking `..`, `%2e%2e`, absolute paths and a non-`.jpg` name
- [ ] **Step 2:** Run the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `index.ts` registers `protocol.handle('daily-shot', …)` with `net.fetch(pathToFileURL(path))` when `shotPath`
    returns a path, and a 404 otherwise. Declare the scheme privileged (`standard`, `secure`) before `ready`.
  - Add `daily-shot:` to the renderer CSP `img-src`.
- [ ] **Step 4:** Run the consumer tests and `pnpm typecheck`. Expected: PASS. Commit: `feat(desktop): replay chapters
  and a locked-down screenshot protocol`.

### Task 4: The Replay screen

**Files:**
- Create: `apps/consumer/src/renderer/components/ReplayScreen.tsx`, plus styles in `src/renderer/styles.css`
- Modify:
  - `src/renderer/components/Rail.tsx`: `Route` gains `'replay'`; a "Replay" button with a new `replay` icon in
    `Icon.tsx`, placed after Today
  - `src/renderer/App.tsx`
  - `src/renderer/lib/api.ts`
  - `src/renderer/components/Onboarding.tsx`: a screenshot step after the screen-text step
  - `src/renderer/components/PrivacySection.tsx`: a "Screenshots for Replay" switch, with the retention note
- Test: `apps/consumer/src/renderer/lib/replay.test.ts`, for the pure view helpers in `src/renderer/lib/replay.ts`

**Interfaces:**
- Consumes: `replay:day` from Task 3.
- Produces, in `src/renderer/lib/replay.ts`:
  ```ts
  ribbon(chapters, dayStart, dayEnd): { id: string; leftPct: number; widthPct: number; label: string; category: string }[]
  shotsFor(chapter, shots): shot[] // shots taken within the chapter's time range
  ```

The layout follows the "Replay your day" mockup board:
- date navigation, reusing `navDates`
- the ribbon of chapters, clickable
- the selected chapter: time, title, the apps with minutes, "What you saw" (titles, plus screenshot thumbnails when
  present), and switches
- a card when screenshots are off:
  - while `!asked`: "See what you saw. Daily can keep small screenshots of the window you're using, only on this PC,
    for `<retention>` days. [Turn on] [Not now]". Both buttons set `screenshotsAsked`.
  - after that, only a quiet link to Settings
- the empty day: "Nothing recorded on this day."
- clicking a thumbnail opens it larger in a lightbox, closed with Esc

- [ ] **Step 1: Failing tests** in `replay.test.ts`:
  - `ribbon places chapters by time`
  - `shotsFor keeps only shots inside the chapter`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the helpers, the screen, the onboarding step, the Privacy switch and the Rail entry.
- [ ] **Step 4:** Run `pnpm --filter @worksight/consumer test` and `pnpm typecheck`. Expected: PASS. Run
  `pnpm --filter @worksight/consumer dev` against a **copy** of a profile (set `DAILY_USER_DATA` as in Task 8) and
  check the screen with real episodes. Commit: `feat(desktop): Replay your day`.

### Task 5: The Island window: top centre, resting pill, new look

**Files:**
- Modify:
  - `apps/consumer/src/main/windows/pill.ts`: add `setResting(r: { total: string; focus: string } | null)`; the window
    stays open while resting is non-null
  - `src/main/index.ts`: placement becomes top centre; `setResting` is called on each tracker tick with today's total
    and the current app, or `null` when the Island is off or tracking is paused
  - `src/pill/main.ts` and `src/pill/pill.css`: the Island look
  - `src/main/settings.ts`: `islandResting: true`, patchable
  - `src/renderer/components/PopupsSection.tsx`: a "Show the Island at the top of the screen" switch
- Test: `apps/consumer/src/main/windows/pill.test.ts` (extend it)

**Interfaces:**
- Produces:
  - `PillManager.setResting(r | null): void`
  - the renderer message `pill:rest` carrying `{ total, focus }`
  - the window: width 640, height 420, transparent, placed with its top edge 8 px below the work area's top, centred

**Look:**
- Resting: a 40 px dark pill with a small Sunny, the total and the focus.
- A nudge expands the pill into a dark rounded card (radius 32) with the existing fields: mini, stat, title, body,
  primary, secondary, snooze, fewer.
- After the last card it collapses back to the pill, not to nothing.
- Reduced motion turns off the expand animation.

- [ ] **Step 1: Failing tests:**
  - `resting keeps the window open after the last card`
  - `setResting(null) closes it once empty`
  - `placement is top centre of the work area`: export a pure `islandPlacement(workArea)` and test it
- [ ] **Step 2:** Run `vitest run src/main/windows`. Expected: FAIL.
- [ ] **Step 3:** Implement. Existing pill tests keep passing (queue, outstanding and empty semantics are unchanged).
- [ ] **Step 4:** Run the consumer tests and typecheck. Expected: PASS. Commit: `feat(desktop): the Island at the top
  of the screen`.

### Task 6: New Island moments

**Files:**
- Create: `apps/consumer/src/main/coach/rules/moments.ts`
- Modify:
  - `coach/rules/index.ts`: append the moment rules to `RULES`
  - `coach/snapshot.ts`: add `bestFocusMs30d: number`, the longest single focus session in the previous 30 days,
    excluding today, computed in the snapshot builder from `focus_sessions`
  - the report scheduler's "written" event in `src/main/index.ts`: show a "Your day is ready to replay" moment through
    `pill.show`
- Test: `apps/consumer/src/main/coach/rules/moments.test.ts`, using `coach/fixtures.ts`

**Interfaces:**
- Produces: the `Rule`s `frequentReturns` and `personalBest`, with the `Candidate` shape from `coach/types.ts`.
  - `frequentReturns`: kind `'behaviour'`; key `returns:<app>:<date>`. It fires when one app has 15 or more separate
    sessions today under 2 minutes each. Title: "You've opened `<app>` `<n>` times today". Body: "Mostly for under a
    minute." Primary: "Got it" (`ack`).
  - `personalBest`: kind `'win'`; key `best:<date>`. It fires when today's longest focus session is at least 45 minutes
    and longer than `bestFocusMs30d`. Title: "Your longest focus stretch this month". Body:
    "`<duration>` on `<app>` without a break in focus." Primary: "Thanks, Sunny" (`ack`).

- [ ] **Step 1: Failing tests:**
  - `frequentReturns fires at 15 short visits, not 14, once per app per day`
  - `ignores long sessions`
  - `personalBest fires only above the 30-day best and 45 min`
  - `once a day`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. The engine's gate already handles cooldowns and "fewer".
- [ ] **Step 4:** Run the consumer tests. Expected: PASS. Commit: `feat(desktop): Island moments: frequent returns, a
  personal best, the day ready`.

### Task 7: Follow-up questions, answered by the local model

**Files:**
- Create: `apps/consumer/src/main/island/ask.ts`
- Modify: `windows/pill.ts`:
  - `pillMessage` gains `{ type: 'ask', id, q }`
  - the manager gains `answer(id, text)`, which sends `pill:answer`
- Modify: `src/pill/main.ts`: up to 3 question chips under a card, the answer bubble, and a "Thinking…" state
- Modify: `src/main/index.ts`: wiring
- Test: `apps/consumer/src/main/island/ask.test.ts`

**Interfaces:**
- Consumes: the writer runner `index.ts` already uses for reports. Wrap it as
  `askLocal(system: string, user: string): Promise<string | null>`, with a schema `{ answer: string }`,
  `maxTokens: 160`, and `null` on error or when no local model is installed.
- Produces:
  ```ts
  export function questionsFor(ruleId: string): string[]; // per moment; [] for unknown rules
  export function askPrompt(q: string, ctx: { nowLabel: string; chapters: Chapter[]; nudgeTitle: string }): { system: string; user: string };
  export const offerQuestions = (localModelReady: boolean, ruleId: string): string[] => (localModelReady ? questionsFor(ruleId) : []);
  ```
- The questions:

  | Rule | Questions |
  |---|---|
  | `frequentReturns` | "Why do I keep opening it?", "When did this start today?" |
  | `personalBest` | "What was I working on?", "How does this compare to last week?" |
  | `doomscroll` and other behaviour rules | "Was any of it for work?", "What else did I do?" |
  | everything else | none |

- `askPrompt` gives the model today's chapters (titles, apps, minutes and times only, never screen text) and asks for
  one or two plain sentences.

- [ ] **Step 1: Failing tests:**
  - `offers questions only when a local model can answer`
  - `questionsFor knows each moment`
  - `askPrompt includes chapter titles and times, never screen samples`, by passing chapters whose episodes had
    samples
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - An answer error shows "I couldn't work that out just now."
  - One question is in flight at a time; a second click while thinking is ignored.
- [ ] **Step 4:** Run the consumer tests and typecheck. Expected: PASS. Commit: `feat(desktop): ask the Island a
  follow-up, answered on this PC`.

### Task 8: Dev profile override, build, and check

**Files:**
- Modify: `src/main/index.ts`
  - In development only (`!app.isPackaged`), honour `DAILY_USER_DATA` by calling `app.setPath('userData', …)` before
    the migration.
  - Skip the Daylens migration when `DAILY_USER_DATA` is set, so a dev run never touches real data.
- Test: run the full suite.

- [ ] **Step 1:** Implement, then run `pnpm --filter @worksight/consumer test` and `typecheck`. Both must PASS.
- [ ] **Step 2:** Run `DAILY_USER_DATA=<scratch copy> pnpm --filter @worksight/consumer dev` and check by hand:
  - the Island rests at the top centre
  - Settings → Pop-ups → "Test pop-up" expands it
  - it collapses back to the pill
  - Replay shows chapters for today
  - turning screenshots on fills "What you saw" with images within a minute
- [ ] **Step 3:** Run `pnpm --filter @worksight/consumer dist` and `check-build`. Expected: OK. Commit:
  `chore(desktop): dev profile override; Daily 1.2.0`.
- [ ] **Step 4:** Bump `package.json` to `1.2.0`, and add "the Island" and "Replay" to the website's features. Run
  `check-site` → OK.

## Self-review

- **Spec coverage (project 2):**
  - the Island (Tasks 5–7)
  - Replay with chapters and "what you saw" (Tasks 3–4)
  - the screenshot switch, off, onboarding and existing-user asks, retention and Delete everything (Tasks 2 and 4)
  - local only (Global Constraints; Task 7 uses the local model only)
- **Ruling:** the chapter stories in Replay are the deterministic titles from Task 3, not AI-written. They work on every
  PC, including those without a local model. AI chapter stories arrive with Plus (project 3) for the cloud, or as a
  local-writer addition later. Cost if wrong: one writer call per chapter, added later.
- **Deferred to project 4:** the "a habit forming" moment, because habits are Plus.
