# Daily M3 — Sunny Service, Status Chip & Coach Nudges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small always-on "Sunny service" shows the user's phone time and Sunny's mood in an ongoing status notification, refreshes tracking every minute (so water reminders and coach nudges arrive on time), and gently nudges the user about long scrolls, their goal and late-night use.

**Architecture:** A Kotlin foreground service (in the existing `daily-native` module) wakes every 60 s and starts a React Native headless JS task (`DailyMinute`). The JS task runs the existing `runSync()` (ingest + mood + reminder tick), a new pure-rule coach tick, and then pushes the chip text and mood back to Kotlin, which updates the ongoing notification. All decisions stay in tested TypeScript; Kotlin only keeps the service alive, draws the notification and restarts after reboot.

**Tech Stack:** Expo SDK 57 · React Native 0.86 `HeadlessJsTaskService` / `AppRegistry.registerHeadlessTask` · androidx `NotificationCompat` (core 1.17) · expo-notifications 57 · expo-sqlite · Vitest 2 + sql.js · JUnit 4 · `@resvg/resvg-js` + `tsx` (asset script, dev only).

**Spec:** `docs/superpowers/specs/2026-10-06-daily-mobile-app-design.md` — this plan is phase **M3** (spec §15: "Foreground service, status chip (+ Live Update on 16+), 60 s ingest, phone-time reminders, nudge rules + gate, Kotlin mood twin, Sunny PNG/outline assets, boot restart, keep-running help"), implementing §8 (outside the app), §9.3, §9.4 and the service part of §12. It also closes items parked from M2. Earlier plans: `docs/superpowers/plans/2026-10-06-daily-m1-skeleton-tracking-today.md`, `docs/superpowers/plans/2026-10-07-daily-m2-reminders-breaks.md`. Visual reference: https://claude.ai/artifact/JmPUVf1cqE17ygnhgar8Gg (boards "Android: status chip + floating buddy", "Reminder notification", "Settings").

## Global Constraints

- Everything from the M1/M2 Global Constraints still holds: package `com.aaronalex.daily`; Expo SDK 57 libraries only via `npx expo install`; root `.npmrc` stays `node-linker=hoisted`; react/react-dom stay pinned to `19.2.3` (root `pnpm.overrides` + web/consumer/agent pins); `android/` is generated and not committed; native config lives in the local module's `AndroidManifest.xml`; no `QUERY_ALL_PACKAGES`; Vitest runs in `Asia/Kolkata`; days are local; only `com.aaronalex.daily` is ever touched on the user's phone.
- Android build: compileSdk 36, targetSdk 36, minSdk 24.
- Sunny service (spec §9.3): foreground service type **`specialUse`**, Play subtype text "Shows the user's live phone time and buddy"; ongoing notification channel id **`sunny`**, importance LOW, silent; notification id **4747**; ticks every **60 s**; restarts after reboot and app update (`BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`); on by default after onboarding, switch in Settings.
- Chip text: title `"<phone time> today"`, short text `"<phone time>"` (Android 16 Live Update chip), body `"<mood title> · <goal line>"`; without usage access: title `Daily`, body `Turn on usage access so Sunny can see your day`, mood `unknown`.
- Coach nudges (spec §9.4): **long stretch** ≥ 30 min continuous in one Social or Fun app, once per stretch · **goal points** once at 80 % ("<left> left") and once at 100 % ("You've reached your goal"), each once per day · **wind-down** first phone use after wind-down time (default **23:00**, until 05:00), once per night · **manners**: at most 1 nudge per **20 min**, none while a call, navigation or music app is in front, every nudge has **"Snooze 1 h"** which silences all nudges for an hour · nudges only while the phone is in use and only after onboarding. Channel id **`coach`**, notification category **`coach`**, action id **`coach-snooze`**.
- Keep `M2` behaviour: reminders/tick/actions keep their tests green; the reminder dedupe (`inflight` + `last_response`) is unchanged.
- Device checks: the user's Realme 7 (Android 12, adb serial `R85H8TTGGULF75UW`, `npx expo run:android --device RMX2151`) when attached; otherwise the Pixel_9 emulator (`-memory 3072 -gpu swiftshader_indirect`). Realme refuses `pm clear`/`appops set`: reset Daily with `adb -s R85H8TTGGULF75UW shell run-as com.aaronalex.daily rm -rf files/SQLite`.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `feat/daily-m3`.

## Deliberate deviations from the spec

- **No Kotlin mood twin.** The chip's text and mood are computed in TypeScript by the minute task (which already has the data) and handed to Kotlin, so there is no second implementation to keep in step. `mood.cases.json` stays the TS test table.
- **Minute checks run as a headless JS task** started by the service, as spec §9.3 describes; Kotlin makes no tracking decisions. The service does not emit a separate "app is open" event to JS — Today already refreshes every 60 s.
- **Android 16 Live Update is best effort**: `setRequestPromotedOngoing` + `setShortCriticalText` on API 36 only; older phones (the user's Android 12) show a normal low-priority ongoing notification.
- **Floating bubble stays in M5** (Plus), as the spec's phase table says.
- **"Keep Sunny running" help is a static list** of steps per phone brand (Realme/Oppo/OnePlus, Xiaomi, Samsung, other) chosen by `Platform.constants.Brand`, plus buttons to Android's battery-optimisation list and Daily's app settings. No `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission (Play-restricted).
- **Parked M2 item still deferred:** the single-slot `last_response` dedupe (A, B, A). Nothing in M3 makes it more likely.

## Review Focus

1. **The service dies (OEM kill, reboot, app update)** → it comes back after reboot/update if the user left it on, and opening Daily restarts it. Pinned by Task 6's `syncSunnyService` tests (start when wanted, stop when not) and the boot receiver reading the persisted "enabled" flag (Task 5 device check).
2. **The same nudge would repeat** (every minute while scrolling, after an app restart, after the service restarts) → once per stretch / per day / per night, remembered in SQLite. Pinned by Task 3's "fires once per stretch, even with a fresh process" test.
3. **The user is on a call, using Maps or playing music** → no nudge. Pinned by Task 2's quiet-app tests (package list and Android category MAPS/AUDIO).
4. **A nudge storm** (several rules true at once, every minute) → at most one nudge per 20 minutes, and "Snooze 1 h" silences all of them. Pinned by Task 2's gap test and Task 3's snooze test.
5. **The user turns "Sunny in the status bar" off** → the service stops and does not come back after a reboot. Pinned by Task 6's `syncSunnyService` stop test and Task 5's `Chip.setEnabled(false)` path (device check: reboot is listed in the checklist).

---

## File Structure

```
apps/mobile/
├─ index.ts                                    + registers the DailyMinute headless task
├─ package.json                                + "assets:sunny" script, dev deps @resvg/resvg-js, tsx
├─ scripts/sunny-assets.ts                     renders Sunny PNGs + the outline vector icon
├─ app/_layout.tsx                             + start/stop the service on launch and resume
├─ app/onboarding.tsx                          + "Show Sunny in your status bar" switch; "Not now" turns built-ins off
├─ app/settings/index.tsx                      + Sunny group, wind-down stepper
├─ app/settings/keep-running.tsx               per-brand "Keep Sunny running" help
├─ app/(tabs)/reminders.tsx                    + optimistic switch, "Break now" on Next up
├─ modules/daily-native/
│  ├─ index.ts                                 + service + chip API
│  └─ android/
│     ├─ build.gradle                          + react-android, junit
│     ├─ src/main/AndroidManifest.xml          + permissions, services, boot receiver
│     ├─ src/main/res/drawable-nodpi/sunny_*.png   generated mood images
│     ├─ src/main/res/drawable/ic_sunny_outline.xml generated status-bar icon
│     ├─ src/main/java/expo/modules/dailynative/{Events,Chip,SunnyService,MinuteTaskService,BootReceiver}.kt
│     └─ src/test/java/expo/modules/dailynative/EventsTest.kt
└─ src/
   ├─ db/schema.ts (+test)                     migration v3: nudges table, apps.android_category
   ├─ db/settings.ts                           + wind_down, coach_snooze_until, sunny_service, exact_alarms
   ├─ tracking/sync.ts (+test)                 stores android_category; sweeps old nudges
   ├─ tracking/runSync.ts                      + exact-alarm change → re-plan
   ├─ settings/data.ts (+test)                 export/delete include nudges
   ├─ reminders/exact.ts (+test)               noteExactAlarms()
   ├─ reminders/store.ts (+test)               + turnOffBuiltins()
   ├─ reminders/notifier.ts, fakeNotifier.ts, expoNotifier.ts   + showCoach(), coach channel/category
   ├─ reminders/actions.ts                     export ResponseLike
   ├─ reminders/responseTask.ts, useResponses.ts   + coach responses
   ├─ coach/rules.ts (+test)                   pure nudge rules + manners gate
   ├─ coach/coach.ts (+test)                   coachTick(): DB → rules → notification → record
   ├─ coach/actions.ts (+test)                 "Snooze 1 h"
   ├─ sunny/svg.ts (+test)                     Sunny as an SVG string (for the asset script)
   ├─ sunny/chip.ts (+test)                    chip text
   ├─ sunny/minuteTask.ts                      the DailyMinute headless task
   └─ sunny/service.ts (+test)                 serviceWanted(), syncSunnyService()
```

---

### Task 1: Database v3, new settings, exact-alarm re-plan

**Files:**
- Modify: `apps/mobile/src/db/schema.ts`, `src/db/settings.ts`, `src/tracking/sync.ts`, `src/tracking/runSync.ts`, `src/settings/data.ts`
- Create: `apps/mobile/src/reminders/exact.ts`
- Test: `src/db/schema.test.ts`, `src/tracking/sync.test.ts`, `src/settings/data.test.ts`, `src/reminders/exact.test.ts`

**Interfaces:**
- Produces: table `nudges(id, kind, key UNIQUE, ts_ms)`; column `apps.android_category INTEGER` (Android `ApplicationInfo.category`, `-1` unknown); settings `wind_down` (`'23:00'`), `coach_snooze_until` (`'0'`), `sunny_service` (`'1'`), `exact_alarms` (`''`); `noteExactAlarms(db: Db, allowed: boolean): boolean` (true when it cleared the plan).

- [ ] **Step 1: Branch**

```bash
git checkout main && git checkout -b feat/daily-m3
```

(If the branch already exists because it holds this plan, just confirm `git branch --show-current` → `feat/daily-m3`.)

- [ ] **Step 2: Write the failing tests**

In `apps/mobile/src/db/schema.test.ts` change the table list and version, and add an upgrade test:

```ts
    expect(tables).toEqual(['apps', 'ingest_state', 'mood_log', 'nudges', 'pickups', 'reminder_state', 'reminders', 'sessions', 'settings', 'water_log']);
    expect(SCHEMA_VERSION).toBe(3);
```

```ts
  it('upgrades a version-2 database, keeping apps and adding android_category', async () => {
    const db = await makeRawTestDb();
    db.exec(MIGRATIONS[0]); db.exec(MIGRATIONS[1]);
    db.exec('PRAGMA user_version = 2');
    db.run("INSERT INTO apps (package, label, category) VALUES ('com.a', 'A', 'fun')");
    migrate(db);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(3);
    expect(db.get<{ android_category: number | null }>("SELECT android_category FROM apps WHERE package = 'com.a'")).toEqual({ android_category: null });
    expect(db.all('SELECT * FROM nudges')).toEqual([]);
  });
```

(Keep the existing v1 upgrade test but change its expected version to `3`.)

In `apps/mobile/src/tracking/sync.test.ts` add (inside `describe('sync', …)`, reusing `at`, `fakeNative`, `morning`, `makeTestDb`, `sync`, `setSetting`):

```ts
  it('stores Android’s own app category', async () => {
    const db = await makeTestDb();
    await sync(db, fakeNative(morning), at(9));
    expect(db.get<{ android_category: number }>("SELECT android_category FROM apps WHERE package = 'com.whatsapp'")).toEqual({ android_category: 4 });
  });

  it('forgets nudges older than the retention setting', async () => {
    const db = await makeTestDb();
    setSetting(db, 'retention_days', 30);
    db.run("INSERT INTO nudges (kind, key, ts_ms) VALUES ('goal80', 'old', ?), ('goal80', 'new', ?)", [at(9) - 40 * 86_400_000, at(8)]);
    await sync(db, fakeNative(morning), at(9));
    expect(db.all<{ key: string }>('SELECT key FROM nudges').map((r) => r.key)).toEqual(['new']);
  });
```

In `apps/mobile/src/settings/data.test.ts`: add `'nudges'` to the export key list (sorted: `['apps', 'exportedAt', 'mood_log', 'nudges', 'pickups', 'reminder_state', 'reminders', 'sessions', 'settings', 'water_log']`) and to the "deletes everything" table loop.

`apps/mobile/src/reminders/exact.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { getSetting, setSetting } from '../db/settings';
import { noteExactAlarms } from './exact';

describe('noteExactAlarms', () => {
  it('clears the saved clock plan only when the permission changes', async () => {
    const db = await makeTestDb();
    setSetting(db, 'clock_plan', 'planned');
    expect(noteExactAlarms(db, false)).toBe(true);   // first sighting
    expect(getSetting(db, 'clock_plan')).toBe('');
    setSetting(db, 'clock_plan', 'planned');
    expect(noteExactAlarms(db, false)).toBe(false);  // unchanged
    expect(getSetting(db, 'clock_plan')).toBe('planned');
    expect(noteExactAlarms(db, true)).toBe(true);    // user allowed exact alarms
    expect(getSetting(db, 'clock_plan')).toBe('');
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — v3 tables/version, `android_category`, `./exact` missing.

- [ ] **Step 4: Implement**

`apps/mobile/src/db/schema.ts` — append a third migration:

```ts
  `ALTER TABLE apps ADD COLUMN android_category INTEGER;
   CREATE TABLE nudges (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, key TEXT NOT NULL UNIQUE, ts_ms INTEGER NOT NULL);
   CREATE INDEX nudges_ts ON nudges(ts_ms);`
```

`apps/mobile/src/db/settings.ts` — add to `DEFAULTS`:

```ts
  wind_down: '23:00',
  coach_snooze_until: '0',
  sunny_service: '1',
  exact_alarms: ''
```

`apps/mobile/src/tracking/sync.ts`:
- change the apps insert to
  `db.run('INSERT OR IGNORE INTO apps (package, label, category, icon_png, android_category) VALUES (?, ?, ?, ?, ?)', [a.pkg, a.label, categoryFor(a.pkg, a.category, null), a.icon, a.category]);`
- in `sweep`, after the day-based loop: `db.run('DELETE FROM nudges WHERE ts_ms < ?', [nowMs - getNumber(db, 'retention_days') * DAY_MS]);`

`apps/mobile/src/settings/data.ts` — `exportJson` adds `nudges: db.all('SELECT kind, key, ts_ms FROM nudges ORDER BY ts_ms'),`; `deleteEverything`'s table list adds `'nudges'`.

`apps/mobile/src/reminders/exact.ts`:

```ts
import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';

/** When the exact-alarm permission changes, forget the saved clock plan so the next tick re-schedules every alarm
 * with the new precision. Returns true when it did. */
export function noteExactAlarms(db: Db, allowed: boolean): boolean {
  const value = allowed ? '1' : '0';
  if (getSetting(db, 'exact_alarms') === value) return false;
  setSetting(db, 'exact_alarms', value);
  setSetting(db, 'clock_plan', '');
  return true;
}
```

`apps/mobile/src/tracking/runSync.ts` — in the `finally`, before the reminder tick:

```ts
      try { noteExactAlarms(getDb(), DailyNative.canScheduleExactAlarms()); } catch (e) { console.warn('daily: exact-alarm check failed', e); }
```

(import `noteExactAlarms` from `../reminders/exact`).

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): schema v3 for nudges, Android app category, exact-alarm re-plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Coach nudge rules (pure)

**Files:**
- Create: `apps/mobile/src/coach/rules.ts`
- Test: `apps/mobile/src/coach/rules.test.ts`

**Interfaces:**
- Consumes: `Category` (tracking/categories), `localDate`, `formatDuration`.
- Produces:
  - `type NudgeKind = 'stretch' | 'goal80' | 'goal100' | 'winddown'`
  - `type Nudge = { kind: NudgeKind; key: string; title: string; body: string }`
  - `type OpenApp = { pkg: string; label: string; category: Category; androidCategory: number | null; startMs: number }`
  - `type CoachInput = { nowMs: number; open: OpenApp | null; phoneMin: number; goalMin: number; windDown: string; lastNudgeMs: number | null; snoozeUntilMs: number; sentKeys: ReadonlySet<string> }`
  - `STRETCH_MIN = 30`, `GAP_MS = 20 * 60_000`
  - `isQuiet(open: OpenApp): boolean`, `inWindDown(nowMs: number, windDown: string): boolean`, `planNudge(i: CoachInput): Nudge | null`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/coach/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAP_MS, inWindDown, isQuiet, planNudge, type CoachInput, type OpenApp } from './rules';

// Tue 6 Oct 2026, Asia/Kolkata.
const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();
const insta: OpenApp = { pkg: 'com.instagram.android', label: 'Instagram', category: 'social', androidCategory: 4, startMs: at(20) };
const base: CoachInput = { nowMs: at(20, 10), open: insta, phoneMin: 60, goalMin: 240, windDown: '23:00', lastNudgeMs: null, snoozeUntilMs: 0, sentKeys: new Set() };

describe('planNudge', () => {
  it('stays quiet when nothing applies or the phone isn’t in use', () => {
    expect(planNudge(base)).toBeNull();
    expect(planNudge({ ...base, nowMs: at(21), open: null, phoneMin: 300 })).toBeNull();
  });

  it('nudges after 30 minutes straight in a social or fun app, once per stretch', () => {
    const n = planNudge({ ...base, nowMs: at(20, 31) });
    expect(n).toEqual({ kind: 'stretch', key: `stretch-com.instagram.android-${at(20)}`, title: '31 minutes on Instagram', body: 'That’s a long stretch. A good spot to stop?' });
    expect(planNudge({ ...base, nowMs: at(20, 45), sentKeys: new Set([n!.key]) })).toBeNull();
    expect(planNudge({ ...base, nowMs: at(20, 31), open: { ...insta, category: 'work' } })).toBeNull();
  });

  it('marks 80% and 100% of the goal once a day each', () => {
    expect(planNudge({ ...base, phoneMin: 200 })).toMatchObject({ kind: 'goal80', key: 'goal80-2026-10-06', title: '40m left' });
    expect(planNudge({ ...base, phoneMin: 245 })).toMatchObject({ kind: 'goal100', key: 'goal100-2026-10-06', title: 'You’ve reached your goal' });
    expect(planNudge({ ...base, phoneMin: 245, sentKeys: new Set(['goal100-2026-10-06']) })).toBeNull();
  });

  it('nudges once per night after wind-down, counting after midnight as the same night', () => {
    expect(planNudge({ ...base, nowMs: at(23, 5) })).toMatchObject({ kind: 'winddown', key: 'winddown-2026-10-06' });
    expect(planNudge({ ...base, nowMs: at(0, 40, 7) })).toMatchObject({ key: 'winddown-2026-10-06' });
    // a fresh 10-minute session, so the long-stretch rule doesn't apply either
    expect(planNudge({ ...base, nowMs: at(0, 40, 7), open: { ...insta, startMs: at(0, 30, 7) }, sentKeys: new Set(['winddown-2026-10-06']) })).toBeNull();
  });

  it('prefers wind-down, then goal, then stretch when several apply', () => {
    expect(planNudge({ ...base, nowMs: at(23, 40), phoneMin: 250, open: { ...insta, startMs: at(23) } })?.kind).toBe('winddown');
    expect(planNudge({ ...base, nowMs: at(20, 40), phoneMin: 250 })?.kind).toBe('goal100');
  });

  it('waits 20 minutes between nudges and respects Snooze 1 h (Review Focus 4)', () => {
    const due = { ...base, nowMs: at(20, 31) };
    expect(planNudge({ ...due, lastNudgeMs: due.nowMs - GAP_MS + 1 })).toBeNull();
    expect(planNudge({ ...due, lastNudgeMs: due.nowMs - GAP_MS })?.kind).toBe('stretch');
    expect(planNudge({ ...due, snoozeUntilMs: due.nowMs + 1 })).toBeNull();
  });

  it('never nudges during a call, navigation or music (Review Focus 3)', () => {
    const due = { ...base, nowMs: at(20, 31), phoneMin: 250 };
    expect(planNudge({ ...due, open: { ...insta, pkg: 'com.google.android.dialer' } })).toBeNull();
    expect(planNudge({ ...due, open: { ...insta, pkg: 'x.nav', androidCategory: 6 } })).toBeNull();
    expect(planNudge({ ...due, open: { ...insta, pkg: 'x.player', androidCategory: 1 } })).toBeNull();
  });
});

describe('helpers', () => {
  it('knows quiet apps', () => {
    expect(isQuiet({ ...insta, pkg: 'com.waze' })).toBe(true);
    expect(isQuiet(insta)).toBe(false);
  });
  it('finds the wind-down window, including a window that starts after midnight', () => {
    expect(inWindDown(at(22, 59), '23:00')).toBe(false);
    expect(inWindDown(at(23, 0), '23:00')).toBe(true);
    expect(inWindDown(at(4, 59, 7), '23:00')).toBe(true);
    expect(inWindDown(at(5, 0, 7), '23:00')).toBe(false);
    expect(inWindDown(at(0, 15, 7), '00:30')).toBe(false);
    expect(inWindDown(at(1, 0, 7), '00:30')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — `./rules` missing.

- [ ] **Step 3: Implement**

`apps/mobile/src/coach/rules.ts`:

```ts
import { localDate } from '@worksight/core/date';
import { formatDuration } from '../format';
import type { Category } from '../tracking/categories';

export type NudgeKind = 'stretch' | 'goal80' | 'goal100' | 'winddown';
export type Nudge = { kind: NudgeKind; key: string; title: string; body: string };
export type OpenApp = { pkg: string; label: string; category: Category; androidCategory: number | null; startMs: number };
export type CoachInput = {
  nowMs: number; open: OpenApp | null; phoneMin: number; goalMin: number; windDown: string;
  lastNudgeMs: number | null; snoozeUntilMs: number; sentKeys: ReadonlySet<string>;
};

export const STRETCH_MIN = 30;
export const GAP_MS = 20 * 60_000;
const WIND_DOWN_END_MIN = 5 * 60; // the "night" ends at 05:00

// Calls, navigation and music: never interrupt them. ponytail: a short list plus Android's MAPS (6) / AUDIO (1) categories.
const QUIET_PKGS = new Set([
  'com.google.android.dialer', 'com.android.dialer', 'com.samsung.android.dialer', 'com.android.incallui', 'com.samsung.android.incallui',
  'com.google.android.apps.maps', 'com.waze', 'com.spotify.music', 'com.google.android.apps.youtube.music'
]);

export function isQuiet(open: OpenApp): boolean {
  return QUIET_PKGS.has(open.pkg) || open.androidCategory === 6 || open.androidCategory === 1;
}

const minutesOfDay = (ms: number): number => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

export function inWindDown(nowMs: number, windDown: string): boolean {
  const [h, m] = windDown.split(':').map(Number);
  const start = h * 60 + m;
  const now = minutesOfDay(nowMs);
  return start >= WIND_DOWN_END_MIN ? now >= start || now < WIND_DOWN_END_MIN : now >= start && now < WIND_DOWN_END_MIN;
}

/** The evening a late-night moment belongs to: 00:40 on Wednesday is still Tuesday's night. */
const nightOf = (nowMs: number): string => localDate(nowMs - WIND_DOWN_END_MIN * 60_000);

/** At most one nudge, only while the phone is in use, respecting snooze, the 20-minute gap and quiet apps. */
export function planNudge(i: CoachInput): Nudge | null {
  if (!i.open || isQuiet(i.open)) return null;
  if (i.nowMs < i.snoozeUntilMs) return null;
  if (i.lastNudgeMs !== null && i.nowMs - i.lastNudgeMs < GAP_MS) return null;

  const day = localDate(i.nowMs);
  const candidates: Nudge[] = [];
  if (inWindDown(i.nowMs, i.windDown)) {
    candidates.push({ kind: 'winddown', key: `winddown-${nightOf(i.nowMs)}`, title: 'Time to wind down', body: 'Sunny’s getting sleepy. Put the phone down soon?' });
  }
  const ratio = i.phoneMin / Math.max(i.goalMin, 1);
  if (ratio >= 1) {
    candidates.push({ kind: 'goal100', key: `goal100-${day}`, title: 'You’ve reached your goal', body: `That’s ${formatDuration(i.goalMin)} on your phone today.` });
  } else if (ratio >= 0.8) {
    candidates.push({ kind: 'goal80', key: `goal80-${day}`, title: `${formatDuration(i.goalMin - i.phoneMin)} left`, body: 'You’re close to your phone goal for today.' });
  }
  const stretchMin = Math.floor((i.nowMs - i.open.startMs) / 60_000);
  if ((i.open.category === 'social' || i.open.category === 'fun') && stretchMin >= STRETCH_MIN) {
    candidates.push({ kind: 'stretch', key: `stretch-${i.open.pkg}-${i.open.startMs}`, title: `${stretchMin} minutes on ${i.open.label}`, body: 'That’s a long stretch. A good spot to stop?' });
  }
  return candidates.find((c) => !i.sentKeys.has(c.key)) ?? null;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/coach
git commit -m "feat(mobile): coach nudge rules with manners gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Coach tick, "Snooze 1 h", and notification wiring

**Files:**
- Create: `apps/mobile/src/coach/coach.ts`, `src/coach/actions.ts`
- Modify: `apps/mobile/src/reminders/notifier.ts`, `src/reminders/fakeNotifier.ts`, `src/reminders/expoNotifier.ts`, `src/reminders/actions.ts` (export `ResponseLike`), `src/reminders/responseTask.ts`, `src/reminders/useResponses.ts`
- Test: `apps/mobile/src/coach/coach.test.ts`, `src/coach/actions.test.ts`

**Interfaces:**
- Consumes: `planNudge`, `OpenApp`, `NudgeKind` (Task 2); `loadState`, `phoneMsForDay`; `isCategory`; `getSetting`/`getNumber`/`setSetting`; `Notifier`.
- Produces:
  - `Notifier.showCoach(key: string, title: string, body: string): Promise<void>` (expo: channel `coach`, category `coach`, data `{ coach: true }`); `FakeNotifier.coach: { key: string; title: string; body: string }[]`
  - `coachTick(db: Db, notifier: Notifier, nowMs: number): Promise<NudgeKind | null>`
  - `COACH_SNOOZE_MS = 60 * 60_000`, `isCoachResponse(r: ResponseLike): boolean`, `handleCoachResponse(db: Db, notifier: Notifier, r: ResponseLike, nowMs: number): Promise<void>`
  - `ResponseLike` exported from `src/reminders/actions.ts`
  - `COACH_CHANNEL = 'coach'` in expoNotifier.ts

- [ ] **Step 1: Extend the Notifier**

In `apps/mobile/src/reminders/notifier.ts` add to the interface:

```ts
  showCoach(key: string, title: string, body: string): Promise<void>;
```

In `src/reminders/fakeNotifier.ts` add a field and method:

```ts
  coach: { key: string; title: string; body: string }[] = [];
  async showCoach(key: string, title: string, body: string) { this.coach.push({ key, title, body }); }
```

In `src/reminders/actions.ts` change `type ResponseLike` to `export type ResponseLike`.

- [ ] **Step 2: Write the failing tests**

`apps/mobile/src/coach/coach.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import { FakeNotifier } from '../reminders/fakeNotifier';
import { coachTick } from './coach';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();

async function scrolling(since: number) {
  const db = await makeTestDb();
  setSetting(db, 'onboarded', '1');
  db.run("INSERT INTO apps (package, label, category, android_category) VALUES ('com.instagram.android', 'Instagram', 'social', 4)");
  db.run('INSERT INTO ingest_state (id, last_event_ms, open_pkg, open_start_ms) VALUES (1, ?, ?, ?)', [since, 'com.instagram.android', since]);
  return db;
}

describe('coachTick', () => {
  it('sends the long-stretch nudge once per stretch, even with a fresh process (Review Focus 2)', async () => {
    const db = await scrolling(at(20));
    const n = new FakeNotifier();
    expect(await coachTick(db, n, at(20, 31))).toBe('stretch');
    expect(n.coach).toEqual([{ key: 'coach-stretch', title: '31 minutes on Instagram', body: 'That’s a long stretch. A good spot to stop?' }]);
    expect(await coachTick(db, new FakeNotifier(), at(20, 55))).toBeNull(); // new notifier = new process; the key lives in SQLite
  });

  it('does nothing before onboarding or when notifications are off', async () => {
    const db = await scrolling(at(20));
    setSetting(db, 'onboarded', '0');
    expect(await coachTick(db, new FakeNotifier(), at(20, 31))).toBeNull();
    setSetting(db, 'onboarded', '1');
    const n = new FakeNotifier();
    n.allowed = false;
    expect(await coachTick(db, n, at(20, 31))).toBeNull();
    expect(db.all('SELECT * FROM nudges')).toEqual([]); // not recorded, so it can still fire later
  });

  it('respects Snooze 1 h and the 20-minute gap (Review Focus 4)', async () => {
    const db = await scrolling(at(20));
    setSetting(db, 'coach_snooze_until', at(21));
    expect(await coachTick(db, new FakeNotifier(), at(20, 31))).toBeNull();
    setSetting(db, 'coach_snooze_until', 0);
    db.run("INSERT INTO nudges (kind, key, ts_ms) VALUES ('goal80', 'goal80-2026-10-06', ?)", [at(20, 20)]);
    expect(await coachTick(db, new FakeNotifier(), at(20, 31))).toBeNull();
    expect(await coachTick(db, new FakeNotifier(), at(20, 40))).toBe('stretch');
  });

  it('treats an app with no category row as other (no stretch nudge)', async () => {
    const db = await scrolling(at(20));
    db.run('DELETE FROM apps');
    expect(await coachTick(db, new FakeNotifier(), at(20, 31))).toBeNull();
  });
});
```

`apps/mobile/src/coach/actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { getNumber } from '../db/settings';
import { FakeNotifier } from '../reminders/fakeNotifier';
import { COACH_SNOOZE_MS, handleCoachResponse, isCoachResponse } from './actions';

const response = (actionIdentifier: string, coach = true) => ({
  actionIdentifier,
  notification: { date: 1, request: { identifier: 'coach-stretch', content: { data: coach ? { coach: true } : { reminderId: 3 } } } }
});

describe('coach responses', () => {
  it('recognises coach notifications', () => {
    expect(isCoachResponse(response('coach-snooze'))).toBe(true);
    expect(isCoachResponse(response('snooze', false))).toBe(false);
  });

  it('"Snooze 1 h" silences nudges for an hour and clears the notification', async () => {
    const db = await makeTestDb();
    const n = new FakeNotifier();
    await handleCoachResponse(db, n, response('coach-snooze'), 1_000);
    expect(getNumber(db, 'coach_snooze_until')).toBe(1_000 + COACH_SNOOZE_MS);
    expect(n.dismissed).toEqual(['coach-stretch']);
  });

  it('a tap on the body changes nothing', async () => {
    const db = await makeTestDb();
    await handleCoachResponse(db, new FakeNotifier(), response('expo.modules.notifications.actions.DEFAULT'), 1_000);
    expect(getNumber(db, 'coach_snooze_until')).toBe(0);
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — `./coach`, `./actions` missing.

- [ ] **Step 4: Implement**

`apps/mobile/src/coach/coach.ts`:

```ts
import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { getNumber, getSetting } from '../db/settings';
import type { Notifier } from '../reminders/notifier';
import { isCategory } from '../tracking/categories';
import { loadState, phoneMsForDay } from '../tracking/sync';
import { planNudge, type NudgeKind, type OpenApp } from './rules';

const DAY_MS = 86_400_000;

function openApp(db: Db): OpenApp | null {
  const s = loadState(db);
  if (s.openPkg === null || s.openStartMs === null) return null;
  const a = db.get<{ label: string; category: string; user_category: string | null; android_category: number | null }>(
    'SELECT label, category, user_category, android_category FROM apps WHERE package = ?', [s.openPkg]);
  const category = isCategory(a?.user_category) ? a!.user_category : isCategory(a?.category) ? a!.category : 'other';
  return { pkg: s.openPkg, label: a?.label ?? s.openPkg, category, androidCategory: a?.android_category ?? null, startMs: s.openStartMs };
}

/** Runs after each sync from the Sunny service's minute task: picks at most one nudge, shows it, remembers its key. */
export async function coachTick(db: Db, notifier: Notifier, nowMs: number): Promise<NudgeKind | null> {
  if (getSetting(db, 'onboarded') !== '1') return null;
  const nudge = planNudge({
    nowMs,
    open: openApp(db),
    phoneMin: phoneMsForDay(db, localDate(nowMs), nowMs) / 60_000,
    goalMin: getNumber(db, 'goal_min'),
    windDown: getSetting(db, 'wind_down'),
    lastNudgeMs: db.get<{ t: number | null }>('SELECT MAX(ts_ms) AS t FROM nudges')?.t ?? null,
    snoozeUntilMs: getNumber(db, 'coach_snooze_until'),
    sentKeys: new Set(db.all<{ key: string }>('SELECT key FROM nudges WHERE ts_ms > ?', [nowMs - 2 * DAY_MS]).map((r) => r.key))
  });
  if (!nudge) return null;
  if (!(await notifier.canNotify().catch(() => false))) return null;
  await notifier.showCoach(`coach-${nudge.kind}`, nudge.title, nudge.body);
  db.run('INSERT OR IGNORE INTO nudges (kind, key, ts_ms) VALUES (?, ?, ?)', [nudge.kind, nudge.key, nowMs]);
  return nudge.kind;
}
```

`apps/mobile/src/coach/actions.ts`:

```ts
import type { Db } from '../db/db';
import { setSetting } from '../db/settings';
import type { ResponseLike } from '../reminders/actions';
import type { Notifier } from '../reminders/notifier';

export const COACH_SNOOZE_MS = 60 * 60_000;

export function isCoachResponse(r: ResponseLike): boolean {
  return r.notification.request.content.data?.coach === true;
}

/** "Snooze 1 h" silences every nudge for an hour. A tap on the body just opens Daily. */
export async function handleCoachResponse(db: Db, notifier: Notifier, r: ResponseLike, nowMs: number): Promise<void> {
  if (r.actionIdentifier !== 'coach-snooze') return;
  setSetting(db, 'coach_snooze_until', nowMs + COACH_SNOOZE_MS);
  await notifier.dismiss(r.notification.request.identifier);
}
```

`apps/mobile/src/reminders/expoNotifier.ts`:
- `export const COACH_CHANNEL = 'coach';`
- in `setupNotifications`, add:

```ts
  await Notifications.setNotificationChannelAsync(COACH_CHANNEL, { name: 'Coach nudges', importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.setNotificationCategoryAsync('coach', [
    { identifier: 'coach-snooze', buttonTitle: 'Snooze 1 h', options: { opensAppToForeground: false } }
  ]);
```

- add to `expoNotifier`:

```ts
  async showCoach(key, title, body) {
    await Notifications.scheduleNotificationAsync({
      identifier: key,
      content: { title, body, categoryIdentifier: 'coach', data: { coach: true } },
      trigger: { channelId: COACH_CHANNEL }
    });
  },
```

`apps/mobile/src/reminders/responseTask.ts` — inside the task, after the payload guard and before `fromResponse`:

```ts
    if (isCoachResponse(data as unknown as ResponseLike)) { await handleCoachResponse(getDb(), expoNotifier, data as unknown as ResponseLike, Date.now()); return; }
```

`apps/mobile/src/reminders/useResponses.ts` — at the top of the effect, after `if (!response) return;`:

```ts
    if (isCoachResponse(response)) {
      handleCoachResponse(getDb(), expoNotifier, response, Date.now()).catch((e) => console.warn('daily: coach action failed', e));
      return;
    }
```

(import `isCoachResponse`, `handleCoachResponse` from `../coach/actions` and `type ResponseLike` from `./actions` where needed).

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`
Expected: all pass (existing reminder tests unchanged).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): coach tick, Snooze 1 h, coach notification channel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Sunny images for the notification

**Files:**
- Create: `apps/mobile/src/sunny/svg.ts`, `apps/mobile/scripts/sunny-assets.ts`, generated `apps/mobile/modules/daily-native/android/src/main/res/drawable-nodpi/sunny_{glowing,happy,alright,fading,sad,unknown}.png`, generated `apps/mobile/modules/daily-native/android/src/main/res/drawable/ic_sunny_outline.xml`
- Modify: `apps/mobile/package.json` (script + dev deps)
- Test: `apps/mobile/src/sunny/svg.test.ts`

**Interfaces:**
- Consumes: `LOOK`, `raysPath`, `SunnyFace` (src/sunny/look.ts).
- Produces: `sunnySvg(face: SunnyFace, size: number): string` (a still frame: glow at its first value, no animation); `outlineVector(): string` (Android VectorDrawable XML, white strokes, 24 dp); script `pnpm --filter @worksight/mobile assets:sunny`.

- [ ] **Step 1: Install dev tools**

```bash
pnpm --filter @worksight/mobile add -D @resvg/resvg-js tsx
```

Add to `apps/mobile/package.json` scripts: `"assets:sunny": "tsx scripts/sunny-assets.ts"`. Confirm react/react-dom at the root are still `19.2.3`.

- [ ] **Step 2: Write the failing test**

`apps/mobile/src/sunny/svg.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LOOK } from './look';
import { outlineVector, sunnySvg } from './svg';

describe('sunnySvg', () => {
  it('draws each mood in its own colours at the asked size', () => {
    const s = sunnySvg('glowing', 192);
    expect(s).toContain('width="192"');
    expect(s).toContain(LOOK.glowing.body);
    expect(s).toContain('#FFC861'); // sparkles
    expect(sunnySvg('sad', 192)).toContain('#7DB8EE'); // tear
    expect(sunnySvg('sad', 192)).not.toContain('#FFC861');
    expect(sunnySvg('unknown', 192)).not.toContain('NaN');
  });
});

describe('outlineVector', () => {
  it('is a white-stroked 24dp Android vector', () => {
    const v = outlineVector();
    expect(v.startsWith('<vector')).toBe(true);
    expect(v).toContain('android:viewportWidth="120"');
    expect(v).toContain('android:strokeColor="#FFFFFFFF"');
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — `./svg` missing.

- [ ] **Step 4: Implement**

`apps/mobile/src/sunny/svg.ts`:

```ts
import { LOOK, raysPath, type SunnyFace } from './look';

const INK = '#3A2412';

/** A still frame of Sunny (no animation) for places outside the app: the notification's large icon. */
export function sunnySvg(face: SunnyFace, size: number): string {
  const L = LOOK[face];
  const parts = [
    `<circle cx="60" cy="60" r="52" fill="${L.body}" opacity="${L.glow[0]}"/>`,
    L.sparkle ? '<path d="M14 14 L16 20 L22 22 L16 24 L14 30 L12 24 L6 22 L12 20 Z M104 92 L105.5 96.5 L110 98 L105.5 99.5 L104 104 L102.5 99.5 L98 98 L102.5 96.5 Z" fill="#FFC861"/>' : '',
    L.rays ? `<path d="${raysPath(L.rays, L.rayLen)}" stroke="${L.edge}" stroke-width="5.5" stroke-linecap="round" fill="none"/>` : '',
    `<circle cx="60" cy="60" r="33" fill="${L.body}" stroke="${L.edge}" stroke-width="3"/>`,
    `<ellipse cx="40" cy="65" rx="6" ry="3.5" fill="#F2836B" opacity="${L.cheek}"/><ellipse cx="80" cy="65" rx="6" ry="3.5" fill="#F2836B" opacity="${L.cheek}"/>`,
    L.brows ? `<path d="${L.brows}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" fill="none"/>` : '',
    `<path d="${L.mouth}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="${L.mouthFill}"/>`,
    `<path d="${L.eyes}" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    L.tear ? '<path d="M44 61 Q41.4 66.5 44 68.5 Q46.6 66.5 44 61 Z" fill="#7DB8EE"/>' : '',
    L.cloud ? '<path d="M70 46 a9 9 0 0 1 4 -17 a12 12 0 0 1 22 1 a8.5 8.5 0 0 1 3 16 z" fill="#F3EEE8" stroke="#B9AFA4" stroke-width="2" stroke-linejoin="round"/>' : ''
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">${parts.join('')}</svg>`;
}

/** Status-bar icon: Android tints it one colour, so it is a white outline of Sunny (rays, face, smile). */
export function outlineVector(): string {
  const stroke = (d: string, w: number) =>
    `<path android:pathData="${d}" android:strokeColor="#FFFFFFFF" android:strokeWidth="${w}" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>`;
  const circle = 'M60,27 a33,33 0 1,0 0.01,0 z';
  return [
    '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="120" android:viewportHeight="120">',
    stroke(raysPath(12, 12), 7),
    stroke(circle, 7),
    stroke('M47 52 L47 56 M73 52 L73 56', 7),
    stroke('M47 67 Q60 78 73 67', 6),
    '</vector>'
  ].join('\n');
}
```

`apps/mobile/scripts/sunny-assets.ts`:

```ts
// Renders Sunny for Android: mood PNGs (notification large icon) and the status-bar outline vector.
// Run with `pnpm --filter @worksight/mobile assets:sunny` after changing src/sunny/look.ts or svg.ts.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { outlineVector, sunnySvg } from '../src/sunny/svg';
import type { SunnyFace } from '../src/sunny/look';

const res = join(__dirname, '..', 'modules', 'daily-native', 'android', 'src', 'main', 'res');
const faces: SunnyFace[] = ['glowing', 'happy', 'alright', 'fading', 'sad', 'unknown'];

mkdirSync(join(res, 'drawable-nodpi'), { recursive: true });
for (const f of faces) {
  const png = new Resvg(sunnySvg(f, 192), { fitTo: { mode: 'width', value: 192 } }).render().asPng();
  writeFileSync(join(res, 'drawable-nodpi', `sunny_${f}.png`), png);
}
mkdirSync(join(res, 'drawable'), { recursive: true });
writeFileSync(join(res, 'drawable', 'ic_sunny_outline.xml'), outlineVector() + '\n');
console.log(`wrote ${faces.length} PNGs and ic_sunny_outline.xml to ${res}`);
```

(If `__dirname` is undefined under tsx's ESM mode, use `dirname(fileURLToPath(import.meta.url))`.)

- [ ] **Step 5: Run the tests, then generate the assets**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile assets:sunny`
Expected: tests pass; the script prints "wrote 6 PNGs…". Open two of the PNGs (read the image files) to confirm they look like the Sunny gallery.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/sunny/svg.ts apps/mobile/src/sunny/svg.test.ts apps/mobile/scripts apps/mobile/modules/daily-native/android/src/main/res
git commit -m "feat(mobile): render Sunny images for the status notification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Sunny service (Kotlin) and the minute task hook

**Files:**
- Create: `apps/mobile/modules/daily-native/android/src/main/java/expo/modules/dailynative/{Events,Chip,SunnyService,MinuteTaskService,BootReceiver}.kt`, `android/src/test/java/expo/modules/dailynative/EventsTest.kt`, `apps/mobile/src/sunny/minuteTask.ts`
- Modify: `modules/daily-native/android/src/main/java/expo/modules/dailynative/DailyNativeModule.kt`, `modules/daily-native/android/src/main/AndroidManifest.xml`, `modules/daily-native/android/build.gradle`, `modules/daily-native/index.ts`, `apps/mobile/index.ts`

**Interfaces:**
- Consumes: the Task 4 drawables (`R.drawable.sunny_*`, `R.drawable.ic_sunny_outline`), `runSync`.
- Produces (JS, on `DailyNativeApi`): `startSunnyService(): void`, `stopSunnyService(): void`, `updateChip(title: string, short: string, text: string, mood: string): void`, `openBatterySettings(): void`. Headless task name **`DailyMinute`**, JS export `minuteTask(): Promise<void>` in `src/sunny/minuteTask.ts`.

- [ ] **Step 1: Pull the event mapping into a testable object (JUnit)**

`android/src/main/java/expo/modules/dailynative/Events.kt`:

```kotlin
package expo.modules.dailynative

/** UsageEvents.Event types Daily reads, as the strings JS expects (see src/tracking/ingest.ts RawEvent). */
object Events {
  fun type(code: Int): String? = when (code) {
    1 -> "resumed"      // ACTIVITY_RESUMED (MOVE_TO_FOREGROUND before API 29)
    2 -> "paused"       // ACTIVITY_PAUSED
    15 -> "screen_on"   // SCREEN_INTERACTIVE
    16 -> "screen_off"  // SCREEN_NON_INTERACTIVE
    18 -> "unlock"      // KEYGUARD_HIDDEN
    26 -> "screen_off"  // DEVICE_SHUTDOWN: closes an app left open when the phone powers off
    else -> null
  }
}
```

`android/src/test/java/expo/modules/dailynative/EventsTest.kt`:

```kotlin
package expo.modules.dailynative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EventsTest {
  @Test fun mapsTheEventsDailyReads() {
    assertEquals("resumed", Events.type(1))
    assertEquals("paused", Events.type(2))
    assertEquals("screen_on", Events.type(15))
    assertEquals("screen_off", Events.type(16))
    assertEquals("unlock", Events.type(18))
    assertEquals("screen_off", Events.type(26))
  }

  @Test fun ignoresEverythingElse() {
    assertNull(Events.type(0))
    assertNull(Events.type(23))
  }
}
```

In `DailyNativeModule.kt` `queryEvents`, replace the `when (e.eventType) { … }` block with `val type = Events.type(e.eventType) ?: continue`.

In `modules/daily-native/android/build.gradle` add:

```gradle
dependencies {
  implementation 'com.facebook.react:react-android'
  testImplementation 'junit:junit:4.13.2'
}
```

(If Gradle can't resolve `react-android` without a version here, check how `expo-modules-core`'s build.gradle depends on it and copy that form.)

Run the JUnit test from the generated project: `cd apps/mobile && npx expo prebuild --platform android --no-install` only if `android/` is missing, then `cd android && ./gradlew.bat projects` to find the module's project name (e.g. `:daily-native`), then `./gradlew.bat :daily-native:testDebugUnitTest`. Expected: 2 tests pass. Record the exact command in the report.

- [ ] **Step 2: The chip notification**

`android/src/main/java/expo/modules/dailynative/Chip.kt`:

```kotlin
package expo.modules.dailynative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** The ongoing "status chip" notification. Its text comes from JS (the minute task); Kotlin only draws it. */
object Chip {
  const val ID = 4747
  const val CHANNEL = "sunny"
  private const val PREFS = "daily_chip"

  data class Data(val title: String, val short: String, val text: String, val mood: String)

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun load(context: Context): Data {
    val p = prefs(context)
    return Data(
      p.getString("title", "Daily") ?: "Daily",
      p.getString("short", "Daily") ?: "Daily",
      p.getString("text", "Sunny is getting ready") ?: "Sunny is getting ready",
      p.getString("mood", "happy") ?: "happy"
    )
  }

  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean("enabled", false)
  fun setEnabled(context: Context, on: Boolean) { prefs(context).edit().putBoolean("enabled", on).apply() }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = context.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL) == null) {
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Sunny", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
      }
    }
  }

  private fun moodImage(mood: String): Int = when (mood) {
    "glowing" -> R.drawable.sunny_glowing
    "happy" -> R.drawable.sunny_happy
    "alright" -> R.drawable.sunny_alright
    "fading" -> R.drawable.sunny_fading
    "sad" -> R.drawable.sunny_sad
    else -> R.drawable.sunny_unknown
  }

  fun build(context: Context, d: Data): Notification {
    ensureChannel(context)
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    val open = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val b = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_sunny_outline)
      .setLargeIcon(BitmapFactory.decodeResource(context.resources, moodImage(d.mood)))
      .setContentTitle(d.title)
      .setContentText(d.text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(false)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setContentIntent(open)
    if (Build.VERSION.SDK_INT >= 36) {
      // Android 16 Live Update: the status-bar chip shows the short text. Best effort.
      try { b.setRequestPromotedOngoing(true).setShortCriticalText(d.short) } catch (e: Throwable) { Log.w("DailySunny", "live update unavailable", e) }
    }
    return b.build()
  }

  /** Called by JS every minute. Saves the text (so a restarted service shows the last known state) and redraws. */
  fun update(context: Context, d: Data) {
    prefs(context).edit().putString("title", d.title).putString("short", d.short).putString("text", d.text).putString("mood", d.mood).apply()
    if (!isEnabled(context)) return
    try { NotificationManagerCompat.from(context).notify(ID, build(context, d)) } catch (e: SecurityException) { Log.w("DailySunny", "no notification permission", e) }
  }
}
```

If `setRequestPromotedOngoing` / `setShortCriticalText` don't exist on the androidx `NotificationCompat.Builder` that the build resolves, delete that `if` block (the deviation section already allows this) and say so in the report.

- [ ] **Step 3: The services and the boot receiver**

`android/src/main/java/expo/modules/dailynative/SunnyService.kt`:

```kotlin
package expo.modules.dailynative

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/** Keeps Daily alive with the status chip and starts the DailyMinute JS task every 60 seconds. */
class SunnyService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val tick = object : Runnable {
    override fun run() {
      try {
        startService(Intent(this@SunnyService, MinuteTaskService::class.java))
        HeadlessJsTaskService.acquireWakeLockNow(this@SunnyService)
      } catch (e: Exception) {
        Log.w("DailySunny", "minute task not started", e)
      }
      handler.postDelayed(this, 60_000)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = Chip.build(this, Chip.load(this))
    try {
      if (Build.VERSION.SDK_INT >= 34) startForeground(Chip.ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      else startForeground(Chip.ID, notification)
    } catch (e: Exception) {
      Log.w("DailySunny", "could not start in the foreground", e)
      stopSelf()
      return START_NOT_STICKY
    }
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
```

`android/src/main/java/expo/modules/dailynative/MinuteTaskService.kt`:

```kotlin
package expo.modules.dailynative

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the JS task registered as "DailyMinute" (apps/mobile/index.ts). Allowed while the app is in front too. */
class MinuteTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig("DailyMinute", Arguments.createMap(), 50_000, true)
}
```

`android/src/main/java/expo/modules/dailynative/BootReceiver.kt`:

```kotlin
package expo.modules.dailynative

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/** Brings the Sunny service back after a reboot or app update — only if the user left it on. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!Chip.isEnabled(context)) return
    try {
      ContextCompat.startForegroundService(context, Intent(context, SunnyService::class.java))
    } catch (e: Exception) {
      Log.w("DailySunny", "could not restart after boot", e)
    }
  }
}
```

- [ ] **Step 4: Manifest**

`modules/daily-native/android/src/main/AndroidManifest.xml` — add next to the existing permissions:

```xml
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <uses-permission android:name="android.permission.WAKE_LOCK" />
  <uses-permission android:name="android.permission.POST_PROMOTED_NOTIFICATIONS" />
```

and before `</manifest>`:

```xml
  <application>
    <service android:name="expo.modules.dailynative.SunnyService" android:exported="false" android:foregroundServiceType="specialUse">
      <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="Shows the user's live phone time and buddy" />
    </service>
    <service android:name="expo.modules.dailynative.MinuteTaskService" android:exported="false" />
    <receiver android:name="expo.modules.dailynative.BootReceiver" android:exported="false">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
        <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
      </intent-filter>
    </receiver>
  </application>
```

- [ ] **Step 5: Module functions and the JS hook**

In `DailyNativeModule.kt` `definition()` add (imports: `androidx.core.content.ContextCompat`):

```kotlin
    Function("startSunnyService") {
      Chip.setEnabled(context, true)
      ContextCompat.startForegroundService(context, Intent(context, SunnyService::class.java))
    }

    Function("stopSunnyService") {
      Chip.setEnabled(context, false)
      context.stopService(Intent(context, SunnyService::class.java))
    }

    Function("updateChip") { title: String, short: String, text: String, mood: String ->
      Chip.update(context, Chip.Data(title, short, text, mood))
    }

    Function("openBatterySettings") {
      context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
```

In `modules/daily-native/index.ts` add to `DailyNativeApi`:

```ts
  startSunnyService(): void;
  stopSunnyService(): void;
  updateChip(title: string, short: string, text: string, mood: string): void;
  openBatterySettings(): void;
```

`apps/mobile/src/sunny/minuteTask.ts` (Task 6 extends it with the coach and the chip):

```ts
import { runSync } from '../tracking/runSync';

/** The "DailyMinute" headless task the Sunny service starts every 60 s. */
export async function minuteTask(): Promise<void> {
  try {
    await runSync();
  } catch (e) {
    console.warn('daily: minute task failed', e);
  }
}
```

`apps/mobile/index.ts`:

```ts
import { AppRegistry } from 'react-native';
import './src/tracking/backgroundTask';
import './src/reminders/responseTask';
import { minuteTask } from './src/sunny/minuteTask';
import 'expo-router/entry';

AppRegistry.registerHeadlessTask('DailyMinute', () => minuteTask);
```

- [ ] **Step 6: Typecheck, tests, device spike (go/no-go)**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`. Build to the device (phone if attached, else emulator). Temporarily add `DailyNative.startSunnyService()` and `console.log('daily: minute')` at the top of `minuteTask` (revert both before committing; Task 6 adds the real start call). Expected:
1. An ongoing "Daily" notification with the Sunny outline in the status bar appears.
2. Metro logs `daily: minute` about every 60 s **with Daily in the background** (press Home and wait 3 minutes).
3. `adb shell dumpsys activity services com.aaronalex.daily` lists `SunnyService` as a foreground service.
4. Call `DailyNative.stopSunnyService()` (temporary code) → the notification disappears and the logs stop.
If the headless task never runs with Daily in the background, stop and report **BLOCKED** with the logcat lines (`adb logcat -s ReactNativeJS DailySunny ReactHost`) — do not work around it.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/modules apps/mobile/src/sunny/minuteTask.ts apps/mobile/index.ts
git commit -m "feat(mobile): Sunny foreground service with status chip and minute task

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Chip content, the full minute task, and starting/stopping the service

**Files:**
- Create: `apps/mobile/src/sunny/chip.ts`, `src/sunny/service.ts`
- Modify: `apps/mobile/src/sunny/minuteTask.ts`, `app/_layout.tsx`, `app/onboarding.tsx`, `app/settings/index.tsx` (Delete everything stops the service)
- Test: `apps/mobile/src/sunny/chip.test.ts`, `src/sunny/service.test.ts`

**Interfaces:**
- Consumes: `formatDuration`, `goalLine`, `MOOD_COPY`, `Mood`, `loadToday`, `coachTick`, `expoNotifier`, `runSync`, `DailyNative` (Task 5 API), `getSetting`/`setSetting`.
- Produces:
  - `type ChipContent = { title: string; short: string; text: string; mood: Mood | 'unknown' }`
  - `chipContent(v: { access: boolean; phoneMin: number; goalMin: number; leftMin: number; mood: Mood }): ChipContent`
  - `type ServiceNative = { startSunnyService(): void; stopSunnyService(): void }`
  - `serviceWanted(db: Db): boolean`, `syncSunnyService(db: Db, native: ServiceNative): void`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/sunny/chip.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chipContent } from './chip';

describe('chipContent', () => {
  it('shows phone time, Sunny’s mood and the goal', () => {
    expect(chipContent({ access: true, phoneMin: 192, goalMin: 240, leftMin: 48, mood: 'alright' })).toEqual({
      title: '3h 12m today', short: '3h 12m', text: "Sunny's doing alright · 48m left before your 4h goal", mood: 'alright'
    });
  });
  it('asks for usage access when Daily can’t see the day', () => {
    expect(chipContent({ access: false, phoneMin: 0, goalMin: 240, leftMin: 240, mood: 'glowing' })).toEqual({
      title: 'Daily', short: 'Daily', text: 'Turn on usage access so Sunny can see your day', mood: 'unknown'
    });
  });
});
```

`apps/mobile/src/sunny/service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import { serviceWanted, syncSunnyService } from './service';

const fake = () => ({ startSunnyService: vi.fn(), stopSunnyService: vi.fn() });

describe('Sunny service', () => {
  it('runs only after onboarding and while the user has it on (Review Focus 1 & 5)', async () => {
    const db = await makeTestDb();
    expect(serviceWanted(db)).toBe(false); // not onboarded
    setSetting(db, 'onboarded', '1');
    expect(serviceWanted(db)).toBe(true);  // on by default
    setSetting(db, 'sunny_service', '0');
    expect(serviceWanted(db)).toBe(false);
  });

  it('starts or stops the native service to match', async () => {
    const db = await makeTestDb();
    setSetting(db, 'onboarded', '1');
    const n = fake();
    syncSunnyService(db, n);
    expect(n.startSunnyService).toHaveBeenCalledTimes(1);
    setSetting(db, 'sunny_service', '0');
    syncSunnyService(db, n);
    expect(n.stopSunnyService).toHaveBeenCalledTimes(1);
  });

  it('never throws if the native call fails', async () => {
    const db = await makeTestDb();
    setSetting(db, 'onboarded', '1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => syncSunnyService(db, { startSunnyService: () => { throw new Error('nope'); }, stopSunnyService: () => {} })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — `./chip`, `./service` missing.

- [ ] **Step 3: Implement**

`apps/mobile/src/sunny/chip.ts`:

```ts
import { formatDuration } from '../format';
import { goalLine } from '../today/copy';
import { MOOD_COPY, type Mood } from './mood';

export type ChipContent = { title: string; short: string; text: string; mood: Mood | 'unknown' };

export function chipContent(v: { access: boolean; phoneMin: number; goalMin: number; leftMin: number; mood: Mood }): ChipContent {
  if (!v.access) return { title: 'Daily', short: 'Daily', text: 'Turn on usage access so Sunny can see your day', mood: 'unknown' };
  const time = formatDuration(v.phoneMin);
  return { title: `${time} today`, short: time, text: `${MOOD_COPY[v.mood].title} · ${goalLine(v.leftMin, v.goalMin)}`, mood: v.mood };
}
```

`apps/mobile/src/sunny/service.ts`:

```ts
import type { Db } from '../db/db';
import { getSetting } from '../db/settings';

export type ServiceNative = { startSunnyService(): void; stopSunnyService(): void };

export function serviceWanted(db: Db): boolean {
  return getSetting(db, 'onboarded') === '1' && getSetting(db, 'sunny_service') === '1';
}

/** Starts or stops the Sunny service to match the settings. Called on launch, on resume and after the user changes it. */
export function syncSunnyService(db: Db, native: ServiceNative): void {
  try {
    if (serviceWanted(db)) native.startSunnyService();
    else native.stopSunnyService();
  } catch (e) {
    console.warn('daily: Sunny service', e);
  }
}
```

`apps/mobile/src/sunny/minuteTask.ts`:

```ts
import DailyNative from '../../modules/daily-native';
import { coachTick } from '../coach/coach';
import { getDb } from '../db/expoDb';
import { expoNotifier } from '../reminders/expoNotifier';
import { loadToday } from '../today/load';
import { runSync } from '../tracking/runSync';
import { chipContent } from './chip';

/** The "DailyMinute" headless task the Sunny service starts every 60 s: sync (+ reminders), coach, then the chip. */
export async function minuteTask(): Promise<void> {
  try {
    const result = await runSync().catch((e) => { console.warn('daily: sync failed', e); return 'ok' as const; });
    const db = getDb();
    const now = Date.now();
    await coachTick(db, expoNotifier, now).catch((e) => console.warn('daily: coach tick failed', e));
    const v = loadToday(db, now);
    const c = chipContent({ access: result !== 'no_access' && DailyNative.hasUsageAccess(), phoneMin: v.phoneMin, goalMin: v.goalMin, leftMin: v.leftMin, mood: v.mood });
    DailyNative.updateChip(c.title, c.short, c.text, c.mood);
  } catch (e) {
    console.warn('daily: minute task failed', e);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: Start and stop it from the app**

`apps/mobile/app/_layout.tsx`:
- import `DailyNative` from `../modules/daily-native` and `syncSunnyService` from `../src/sunny/service`;
- in the setup effect (after `registerSyncTask()`), call `syncSunnyService(getDb(), DailyNative);`
- in `Gate`'s existing AppState `active` handler (added in M2), also call `syncSunnyService(getDb(), DailyNative);`

`apps/mobile/app/onboarding.tsx` — step 4 (`step === 3`):
- add state `const [showSunny, setShowSunny] = useState(true);`
- under the two reminder points, add a row:

```tsx
            <View style={s.point}>
              <View style={s.pointIco}><Icon name="bell" size={15} /></View>
              <Text style={s.pointText}>Show Sunny and your phone time in the status bar</Text>
              <Switch value={showSunny} onValueChange={setShowSunny} accessibilityLabel="Show Sunny in the status bar" trackColor={{ false: C.line, true: C.ink }} thumbColor={C.white} />
            </View>
```

- in `finish`, before `applyReminders()`: `setSetting(db, 'sunny_service', showSunny ? '1' : '0');` and after `setSetting(db, 'onboarded', '1')`: `syncSunnyService(db, DailyNative);`
(import `Switch` from react-native, `DailyNative`, `syncSunnyService`).

`apps/mobile/app/settings/index.tsx` — in the Delete everything handler, after `deleteEverything(...)` (which resets `onboarded`): `syncSunnyService(getDb(), DailyNative);` so the service stops.

- [ ] **Step 6: Typecheck and device check**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`. On the device (reset Daily first): finish onboarding with the switch on → the ongoing notification appears and within ~1 minute shows "<time> today" and "<mood> · <goal line>" with Sunny's face; leave Daily in the background for 3 minutes and confirm the time updates; with usage access off the chip says "Turn on usage access…"; Settings → Delete everything → the notification disappears. Screenshot the expanded notification.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/sunny apps/mobile/app
git commit -m "feat(mobile): live status chip, coach in the minute task, service on/off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Settings — Sunny switch, wind-down time, "Keep Sunny running"

**Files:**
- Create: `apps/mobile/app/settings/keep-running.tsx`
- Modify: `apps/mobile/app/settings/index.tsx`

**Interfaces:**
- Consumes: `getSetting`/`setSetting` (`sunny_service`, `wind_down`), `syncSunnyService`, `DailyNative.openBatterySettings`, `stepTime` (src/reminders/form.ts), `clock12` (`@worksight/core/reminders`), `Linking.openSettings`, `Platform.constants`.
- Produces: route `/settings/keep-running`.

- [ ] **Step 1: Settings rows**

In `apps/mobile/app/settings/index.tsx`:
- state: `const [sunny, setSunny] = useState(() => getSetting(db, 'sunny_service') === '1');` and `const [windDown, setWindDown] = useState(() => getSetting(db, 'wind_down'));`
- in the Goals group, after the goal stepper row:

```tsx
        <View style={s.row}>
          <Text style={s.rowText}>Wind down after</Text>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => { const t = stepTime(windDown, -30); setWindDown(t); setSetting(db, 'wind_down', t); }} accessibilityRole="button" accessibilityLabel="Earlier" style={s.small}><Icon name="minus" size={16} /></Pressable>
            <Text style={s.value} accessibilityLiveRegion="polite">{clock12(windDown)}</Text>
            <Pressable onPress={() => { const t = stepTime(windDown, 30); setWindDown(t); setSetting(db, 'wind_down', t); }} accessibilityRole="button" accessibilityLabel="Later" style={s.small}><Icon name="plus" size={16} /></Pressable>
          </View>
        </View>
```

- a new group after Goals (shift later `Group i` numbers by one):

```tsx
      <Group i={2} label="Sunny">
        <View style={s.row}>
          <Text style={s.rowText}>Sunny in the status bar</Text>
          <Switch value={sunny} accessibilityLabel="Sunny in the status bar" trackColor={{ false: C.line, true: C.ink }} thumbColor={C.white} style={{ marginLeft: 'auto' }}
            onValueChange={(on) => { setSunny(on); setSetting(db, 'sunny_service', on ? '1' : '0'); syncSunnyService(db, DailyNative); }} />
        </View>
        <Link href="/settings/keep-running" asChild>
          <Pressable accessibilityRole="button" style={s.row}><Text style={s.rowText}>Keep Sunny running</Text><Text style={s.value}>Help</Text></Pressable>
        </Link>
      </Group>
```

- add style `small: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }`; imports `Switch`, `DailyNative`, `syncSunnyService`, `stepTime`, `clock12`.

- [ ] **Step 2: The help screen**

`apps/mobile/app/settings/keep-running.tsx`:

```tsx
import { router } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DailyNative from '../../modules/daily-native';
import { C, F } from '../../src/theme';
import { Icon } from '../../src/ui/icons';

const TIPS: { brands: string[]; name: string; steps: string[] }[] = [
  { brands: ['realme', 'oppo', 'oneplus'], name: 'Realme, OPPO and OnePlus', steps: ['Settings → Battery → More settings → turn off "Optimise battery use" for Daily.', 'Settings → Apps → Daily → Battery usage → allow background activity and auto launch.', 'In the recent-apps screen, pull Daily down to lock it.'] },
  { brands: ['xiaomi', 'redmi', 'poco'], name: 'Xiaomi, Redmi and POCO', steps: ['Settings → Apps → Daily → Battery saver → No restrictions.', 'Settings → Apps → Daily → Autostart → on.', 'Lock Daily in the recent-apps screen.'] },
  { brands: ['samsung'], name: 'Samsung', steps: ['Settings → Apps → Daily → Battery → Unrestricted.', 'Settings → Battery → Background usage limits → make sure Daily is not in "Sleeping apps".'] },
  { brands: [], name: 'Other phones', steps: ['Settings → Apps → Daily → Battery → allow background use / Unrestricted.', 'Turn off battery optimisation for Daily.'] }
];

function brand(): string {
  return String((Platform.constants as { Brand?: string }).Brand ?? '').toLowerCase();
}

export default function KeepRunning() {
  const insets = useSafeAreaInsets();
  const b = brand();
  const mine = TIPS.find((t) => t.brands.includes(b)) ?? TIPS[TIPS.length - 1];
  const others = TIPS.filter((t) => t !== mine);
  const open = (fn: () => unknown) => { try { fn(); } catch (e) { console.warn('daily: opening settings failed', e); } };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 14 }}>
      <View style={s.head}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={s.round}><Icon name="back" size={18} /></Pressable>
        <Text style={s.h1}>Keep Sunny running</Text>
      </View>
      <Text style={s.p}>Some phones close apps in the background to save battery. If Sunny’s notification disappears or reminders arrive late, change these settings.</Text>
      <View style={s.card}>
        <Text style={s.cardTitle}>{mine.name}</Text>
        {mine.steps.map((step, i) => <Text key={i} style={s.step}>{i + 1}. {step}</Text>)}
      </View>
      <Pressable onPress={() => open(() => DailyNative.openBatterySettings())} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>Open battery settings</Text></Pressable>
      <Pressable onPress={() => open(() => Linking.openSettings())} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>Open Daily’s app settings</Text></Pressable>
      {others.map((t) => (
        <View key={t.name} style={s.card}>
          <Text style={s.cardTitle}>{t.name}</Text>
          {t.steps.map((step, i) => <Text key={i} style={s.step}>{i + 1}. {step}</Text>)}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  p: { fontFamily: F.regular, fontSize: 14, lineHeight: 21, color: C.body },
  card: { backgroundColor: C.white, borderRadius: 20, padding: 16, gap: 8 },
  cardTitle: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  step: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.body },
  primary: { minHeight: 52, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 15, color: C.white },
  secondary: { minHeight: 48, borderRadius: 999, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: F.semi, fontSize: 14, color: C.ink }
});
```

- [ ] **Step 3: Typecheck and device check**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`. On the device: Settings shows "Wind down after 11:00 pm" (± moves by 30 min), the Sunny group's switch removes and restores the status notification, "Keep Sunny running" shows the phone's brand first (Realme on the user's phone, "Other phones" on the emulator) and both buttons open Android settings (press Back to return). Screenshot Settings and the help screen.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/settings
git commit -m "feat(mobile): Sunny settings, wind-down time and keep-running help

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Items parked from M2

**Files:**
- Modify: `apps/mobile/src/reminders/store.ts`, `app/onboarding.tsx`, `app/(tabs)/reminders.tsx`
- Test: `apps/mobile/src/reminders/store.test.ts`

**Interfaces:**
- Produces: `turnOffBuiltins(db: Db): void` (seeds if needed, then switches every built-in off).

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/reminders/store.test.ts`:

```ts
  it('can switch all built-ins off (onboarding "Not now")', async () => {
    const db = await makeTestDb();
    saveReminder(db, custom);
    turnOffBuiltins(db);
    const all = listReminders(db);
    expect(all.filter((r) => r.builtin).every((r) => !r.enabled)).toBe(true);
    expect(all.find((r) => !r.builtin)!.enabled).toBe(true);
  });
```

(import `turnOffBuiltins`).

- [ ] **Step 2: Run to see it fail, implement, run again**

Run: `pnpm --filter @worksight/mobile test` → FAIL (`turnOffBuiltins` missing). Add to `store.ts`:

```ts
/** Onboarding's "Not now": keep the built-ins but switch them off; the user can turn them on in Reminders. */
export function turnOffBuiltins(db: Db): void {
  listReminders(db); // seeds the built-ins if this is a fresh database
  db.run('UPDATE reminders SET enabled = 0 WHERE builtin IS NOT NULL');
}
```

Run again → pass.

- [ ] **Step 3: Onboarding "Not now" turns the built-ins off**

In `apps/mobile/app/onboarding.tsx`, step 4's "Not now" button: `onPress={async () => { if (finishing.current) return; turnOffBuiltins(getDb()); await finish(); }}` (import `turnOffBuiltins`). Keep its `disabled={busy}`.

- [ ] **Step 4: Reminders tab — no switch flicker, and "Break now"**

In `apps/mobile/app/(tabs)/reminders.tsx`:
- in `toggle`, before the `try`, update the view model optimistically: `setVm((cur) => cur && { ...cur, reminders: cur.reminders.map((x) => (x.id === r.id ? { ...x, enabled: on } : x)) });`
- in the Next up card, next to "Skip today", when the reminder has a break:

```tsx
          {vm.next.reminder.breakSec > 0 && (
            <Pressable onPress={() => router.push({ pathname: '/break', params: { id: String(vm.next!.reminder.id) } })} accessibilityRole="button" accessibilityLabel={`Start a ${vm.next.reminder.name} break now`} style={s.skip}>
              <Text style={s.skipText}>Break now</Text>
            </Pressable>
          )}
```

(spec §9.2: breaks open from a notification or the Reminders tab).

- [ ] **Step 5: Typecheck, tests, device check, commit**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`. Device: onboarding "Not now" → Reminders tab shows all built-ins off; toggling a switch doesn't snap back; "Break now" on Next up opens the break.

```bash
git add apps/mobile/src/reminders/store.ts apps/mobile/src/reminders/store.test.ts apps/mobile/app/onboarding.tsx "apps/mobile/app/(tabs)/reminders.tsx"
git commit -m "fix(mobile): onboarding Not now turns built-ins off; steady switches; Break now

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Phase check

**Files:**
- Create: `docs/superpowers/plans/2026-10-07-daily-m3-checklist.md`

- [ ] **Step 1: Full test run and builds**

Run: `pnpm test`, `pnpm --filter @worksight/web build`, and from `apps/consumer` `npx electron-vite build`, plus the JUnit command recorded in Task 5. If a desktop suite fails only on `better_sqlite3` ABI, run `pnpm --filter @worksight/consumer pretest` and retry. Never kill the user's running `Daylens.exe`.
Expected: all green; report per-workspace counts.

- [ ] **Step 2: Write the checklist**

`docs/superpowers/plans/2026-10-07-daily-m3-checklist.md`:

```markdown
# Daily M3 — phone checklist (Realme 7, Android 12)

Build: `cd apps/mobile && npx expo run:android --device RMX2151`. Reset Daily only: `adb -s R85H8TTGGULF75UW shell run-as com.aaronalex.daily rm -rf files/SQLite`.

- [ ] Onboarding step 4 has "Show Sunny in the status bar" (on) → after finishing, the Sunny notification appears
- [ ] Within a minute the notification shows "<time> today" and "<mood> · <goal line>" with Sunny's face; it updates with Daily in the background
- [ ] Settings → Sunny in the status bar off → notification gone; on → back
- [ ] Reboot the phone with Sunny on → the notification comes back without opening Daily; with Sunny off → it stays off
- [ ] Scroll Instagram (or any Social/Fun app) for 30+ minutes → one "30 minutes on …" nudge; no second one for the same stretch
- [ ] Cross 80 % and 100 % of the goal → one nudge each that day
- [ ] Use the phone after 11 pm → one "Time to wind down" nudge that night
- [ ] Tap "Snooze 1 h" on a nudge → no nudges for an hour
- [ ] On a phone call or in Maps for 30+ minutes → no nudge
- [ ] Water reminder arrives within about a minute of crossing an hour of phone time (Daily in the background)
- [ ] Settings → Keep Sunny running shows the Realme steps first; both buttons open Android settings
- [ ] Settings → Wind down after moves by 30 minutes
- [ ] Onboarding "Not now" on the reminders step → all built-ins off in Reminders
- [ ] Reminders tab: switches don't flicker; "Break now" opens the break
- [ ] Settings → Delete everything → the Sunny notification disappears
- [ ] (Android 16 emulator) the status-bar chip shows the phone time (Live Update)
- [ ] Still open from M2: force-stop re-arm, exact-alarm card, cold-start "Take a break", warm time-zone change, "Allow notifications" opens settings
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-10-07-daily-m3-checklist.md
git commit -m "docs: Daily M3 phone checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
