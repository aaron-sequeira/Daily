# Daily M2 — Reminders & Breaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily reminds the user to drink water, eat and take tea breaks (plus their own reminders) with Android notifications that have action buttons, and opens a full-screen animated break when they choose to take one.

**Architecture:** Reminder types and validation move from the desktop app into `@worksight/core` and are shared. Reminders live in SQLite. Pure functions plan the next 7 days of clock alarms and decide which phone-time reminders are due; a small `Notifier` interface hides `expo-notifications` so all scheduling and action logic is unit-tested with a fake. The existing sync entry point (`runSync`, run on app open, every 60 s on Today and by the 15-min background task) also runs the reminder tick.

**Tech Stack:** Expo SDK 57 · expo-notifications 57 · expo-task-manager · expo-router · react-native-svg · react-native-reanimated 4 · expo-sqlite · Kotlin (Expo Modules API) · Vitest 2 + sql.js.

**Spec:** `docs/superpowers/specs/2026-10-06-daily-mobile-app-design.md` — this plan is phase **M2** (spec §15), implementing §9.1, §9.2, the reminder parts of §6, §12 and §13. Visual reference: https://claude.ai/artifact/JmPUVf1cqE17ygnhgar8Gg (boards Reminders, Water break, Reminder notification). M1 plan for context: `docs/superpowers/plans/2026-10-06-daily-m1-skeleton-tracking-today.md`.

## Global Constraints

- Everything from the M1 plan's Global Constraints still holds: package `com.aaronalex.daily`, Expo SDK 57 libraries only via `npx expo install`, root `.npmrc` stays `node-linker=hoisted`, `android/` not committed, no `QUERY_ALL_PACKAGES`, tokens/DM Sans/motion rules, days are local and split at local midnight, Vitest runs in `Asia/Kolkata`.
- React/react-dom are pinned to `19.2.3` across the repo (root `pnpm.overrides` + web/consumer/agent pins). Never change them in this phase.
- Built-in reminders (spec §9.1): **Water** every 60 min of phone time · **Lunch** 13:00 Mon–Fri, 30-min break · **Tea** 16:00 Mon–Fri, **5-min** break · **Dinner** 19:30 every day, **off**. Other values come from the desktop's `builtinDefaults`.
- Custom reminders: time + days, or every N minutes of phone time (15–240); break length or "no break, just a nudge"; at most 20.
- Notification actions: **I had some** (water), **Take a break**, **Snooze 15 min**, **Done** (no-break reminders). Snooze = 15 minutes.
- Days of the week are `1 = Monday … 7 = Sunday` everywhere (core's `localDayOf`).
- Breaks open only inside Daily (route `/break?id=`). Never drawn over other apps.
- Notification channel id `reminders`, importance HIGH. Scheduled-notification identifiers: `rem-<id>-<YYYY-MM-DD>` (clock), `snooze-<id>` (snooze), `now-<id>` (phone-time reminder fired now).
- Phone-time reminders in M2 are checked whenever `runSync` runs (app open, Today's 60 s refresh, the 15-min background task). The minute-by-minute check comes with SunnyService in M3.
- Test on the user's phone (Realme 7, Android 12, adb serial `R85H8TTGGULF75UW`, `npx expo run:android --device RMX2151` from `apps/mobile`). Touch only `com.aaronalex.daily`. Realme refuses `adb pm clear` / `appops set`: reset Daily with `adb -s R85H8TTGGULF75UW shell run-as com.aaronalex.daily rm -rf files/SQLite`.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `feat/daily-m2`.

## Deliberate deviations from the spec

- **Clock reminders use one-off date alarms for the next 7 days, re-planned on every `runSync`,** instead of repeating weekly alarms (spec §9.1). A rolling plan lets "Skip today" drop one day, and re-planning in local time keeps alarms right after a time-zone or DST change. The background task keeps the 7-day window topped up.
- **Break scenes: 5 kinds** (water, meal, tea, dinner, stretch). The spec names four; the built-in Dinner reminder needs a dinner scene. The other desktop animations (walk, eyes, medicine, call, breathe) are not offered on the phone; a reminder carrying one falls back to the stretch scene.
- **Onboarding's 4th step is "Reminders" only** (asks for notification permission). Spec §12 also puts the Sunny service there; that arrives in M3.

## Review Focus

1. **The phone's time zone or DST changes** → reminders fire at the right local time after the next app open / background run. Pinned by Task 3's re-plan-in-another-zone test.
2. **"I had some" is handled twice** (the background action task and the in-app listener both see it, or the user taps twice) → one glass logged, one state change. Pinned by Task 4's duplicate-response test.
3. **Re-planning alarms must not cancel a snooze** → a snoozed reminder still arrives 15 min later even though the clock plan was rebuilt. Pinned by Task 4's snooze-survives-replan test.
4. **The user edits a reminder's time or turns it off** → the old alarm is gone and only the new one is scheduled. Pinned by Task 4's edit test.
5. **Delete everything** → reminders return to the defaults and the alarms are re-planned (not left pointing at deleted reminders). Pinned by Task 4's delete test.

---

## File Structure

```
packages/core/src/reminders.ts            moved from apps/consumer/src/shared/reminders.ts (unchanged code)
packages/core/package.json                + "./reminders" export
apps/consumer/src/shared/reminders.ts     becomes a one-line re-export
apps/mobile/
├─ index.ts                               + imports the notification response task
├─ app.json                               + expo-notifications plugin, SCHEDULE_EXACT_ALARM (via module manifest)
├─ app/_layout.tsx                        + notifications setup, response handling, break screen as full-screen modal
├─ app/(tabs)/_layout.tsx                 + Reminders tab
├─ app/(tabs)/reminders.tsx               Reminders tab (next up, list, switches, permission cards)
├─ app/reminder/[id].tsx                 reminder editor ('new' or id)
├─ app/break.tsx                          full-screen break
├─ app/onboarding.tsx                     + step 4 (reminders)
├─ modules/daily-native/…                 + canScheduleExactAlarms(), openExactAlarmSettings(), permission
└─ src/
   ├─ db/schema.ts (+test)                migration v2: reminders, reminder_state, water_log
   ├─ db/settings.ts                      + clock_plan, last_response
   ├─ db/testDb.ts                        + makeRawTestDb()
   ├─ tracking/sync.ts (+test)            + phoneMsSince()
   ├─ tracking/runSync.ts                 + reminder tick after sync
   ├─ settings/data.ts (+test)            export/delete include reminder tables
   ├─ reminders/defaults.ts (+test)       mobile defaults, mobile animations, look per animation
   ├─ reminders/store.ts (+test)          CRUD + state + water log
   ├─ reminders/plan.ts (+test)           clock slots, due phone-time reminders, next up
   ├─ reminders/notifier.ts               Notifier interface + reminderContent()
   ├─ reminders/tick.ts (+test)           re-plan alarms when the plan changed; fire due phone-time reminders
   ├─ reminders/actions.ts (+test)        notification action handling (dedupe, snooze, water, open break)
   ├─ reminders/expoNotifier.ts           expo-notifications implementation + setup
   ├─ reminders/responseTask.ts           background action task (Android)
   ├─ reminders/useResponses.ts           in-app response handling + navigation
   ├─ reminders/apply.ts                  applyReminders() for screens
   ├─ reminders/form.ts (+test)           editor form helpers
   ├─ break/countdown.ts (+test)          clock text + progress
   ├─ break/Scene.tsx                     5 animated scenes
   └─ ui/icons.tsx                        + drop, meal, cup, moon, person
```

---

### Task 1: Share reminder types through `@worksight/core`; phone defaults

**Files:**
- Move: `apps/consumer/src/shared/reminders.ts` → `packages/core/src/reminders.ts` (code unchanged)
- Create: `apps/consumer/src/shared/reminders.ts` (re-export), `apps/mobile/src/reminders/defaults.ts`
- Modify: `packages/core/package.json` (exports)
- Test: `apps/mobile/src/reminders/defaults.test.ts` (desktop's existing `apps/consumer/src/shared/reminders.test.ts` must stay green unchanged)

**Interfaces:**
- Produces: `@worksight/core/reminders` with everything the desktop file exported (`Reminder`, `ReminderInput`, `Schedule`, `Animation`, `Builtin`, `LIMITS`, `validateReminder`, `builtinDefaults`, `reminderTitle`, `reminderSummary`, `clock12`, `localDayOf`, `ANIMATIONS`, `ANIMATION_LOOK`, `BREAK_OPTIONS`).
- Produces (mobile): `MOBILE_ANIMATIONS = ['water','meal','tea','dinner','stretch'] as const`, `type MobileAnimation`, `sceneKind(a: string): MobileAnimation`, `mobileDefaults(): Omit<Reminder,'id'>[]`, `ANIM_LOOK: Record<MobileAnimation, { label: string; color: string; icon: 'drop'|'meal'|'cup'|'moon'|'person'; breakTitle: string }>`.

- [ ] **Step 1: Branch**

The branch `feat/daily-m2` already exists (it holds this plan). Confirm: `git branch --show-current` → `feat/daily-m2`.

- [ ] **Step 2: Move the file and re-export it**

```bash
git mv apps/consumer/src/shared/reminders.ts packages/core/src/reminders.ts
```

Create `apps/consumer/src/shared/reminders.ts`:

```ts
// Shared with the Daily phone app; the code lives in @worksight/core.
export * from '@worksight/core/reminders';
```

In `packages/core/package.json` add to `exports` (after `"./date"`):

```json
"./reminders": "./src/reminders.ts",
```

- [ ] **Step 3: Desktop still green**

Run: `pnpm --filter @worksight/consumer test` (if it fails only on a `better_sqlite3` ABI mismatch, run `pnpm --filter @worksight/consumer pretest` first) and `pnpm --filter @worksight/consumer typecheck` and `pnpm --filter @worksight/core typecheck`.
Expected: all pass, `src/shared/reminders.test.ts` unchanged and green. Do not kill a running `Daylens.exe` (the user's installed app).

- [ ] **Step 4: Write the failing mobile test**

`apps/mobile/src/reminders/defaults.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateReminder } from '@worksight/core/reminders';
import { ANIM_LOOK, MOBILE_ANIMATIONS, mobileDefaults, sceneKind } from './defaults';

describe('mobileDefaults', () => {
  it('has the spec’s four built-ins', () => {
    const d = mobileDefaults();
    expect(d.map((r) => r.builtin)).toEqual(['water', 'lunch', 'tea', 'dinner']);
    expect(d.find((r) => r.builtin === 'water')!.schedule).toEqual({ type: 'interval', minutes: 60 });
    expect(d.find((r) => r.builtin === 'lunch')!.schedule).toEqual({ type: 'time', time: '13:00', days: [1, 2, 3, 4, 5] });
    expect(d.find((r) => r.builtin === 'lunch')!.breakSec).toBe(1800);
    expect(d.find((r) => r.builtin === 'tea')!.breakSec).toBe(300);
    expect(d.find((r) => r.builtin === 'dinner')!.enabled).toBe(false);
    for (const r of d) expect(validateReminder(r)).toBeNull();
  });

  it('maps any animation to one of the five phone scenes', () => {
    expect(MOBILE_ANIMATIONS.map(sceneKind)).toEqual([...MOBILE_ANIMATIONS]);
    expect(sceneKind('walk')).toBe('stretch');
    expect(sceneKind('nonsense')).toBe('stretch');
    for (const a of MOBILE_ANIMATIONS) expect(ANIM_LOOK[a].color).toMatch(/^#[0-9A-F]{6}$/);
  });
});
```

- [ ] **Step 5: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./defaults`.

- [ ] **Step 6: Implement**

`apps/mobile/src/reminders/defaults.ts`:

```ts
import { builtinDefaults, type Reminder } from '@worksight/core/reminders';

export const MOBILE_ANIMATIONS = ['water', 'meal', 'tea', 'dinner', 'stretch'] as const;
export type MobileAnimation = typeof MOBILE_ANIMATIONS[number];

/** The phone draws five scenes; anything else (a desktop-only animation) uses stretch. */
export function sceneKind(a: string): MobileAnimation {
  return (MOBILE_ANIMATIONS as readonly string[]).includes(a) ? (a as MobileAnimation) : 'stretch';
}

/** Spec §9.1: the desktop's built-ins on weekdays, but tea is a 5-minute break on the phone. */
export function mobileDefaults(): Omit<Reminder, 'id'>[] {
  return builtinDefaults([1, 2, 3, 4, 5]).map((r) => (r.builtin === 'tea' ? { ...r, breakSec: 300 } : r));
}

export const ANIM_LOOK: Record<MobileAnimation, { label: string; color: string; icon: 'drop' | 'meal' | 'cup' | 'moon' | 'person'; breakTitle: string }> = {
  water: { label: 'Water', color: '#CFE6FB', icon: 'drop', breakTitle: 'Take a few sips' },
  meal: { label: 'Meal', color: '#BFEBD3', icon: 'meal', breakTitle: 'Time to eat' },
  tea: { label: 'Tea', color: '#F9DDB9', icon: 'cup', breakTitle: 'Put the kettle on' },
  dinner: { label: 'Dinner', color: '#F4C6C8', icon: 'moon', breakTitle: 'Dinner time' },
  stretch: { label: 'Stretch', color: '#D8D2FC', icon: 'person', breakTitle: 'Stand up and stretch' }
};
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/reminders.ts packages/core/package.json apps/consumer/src/shared/reminders.ts apps/mobile/src/reminders
git commit -m "feat(core): share reminder types with Daily; phone reminder defaults

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database v2 and the reminder store

**Files:**
- Modify: `apps/mobile/src/db/schema.ts`, `src/db/testDb.ts`, `src/db/settings.ts`, `src/settings/data.ts`
- Create: `apps/mobile/src/reminders/store.ts`
- Test: `src/db/schema.test.ts` (update + upgrade test), `src/reminders/store.test.ts`, `src/settings/data.test.ts` (update)

**Interfaces:**
- Consumes: `Db`, `migrate`, `mobileDefaults`, `validateReminder`, `LIMITS`, `localDate`.
- Produces:
  - Tables `reminders(id, builtin UNIQUE, name, message, animation, schedule JSON, break_sec, enabled)`, `reminder_state(id, last_fired_at, last_done_at, skip_date)`, `water_log(ts_ms PK, day)`.
  - `makeRawTestDb(): Promise<Db>` (unmigrated), `MIGRATIONS` exported from schema.ts.
  - Settings keys `clock_plan` (default `''`) and `last_response` (default `''`).
  - `type ReminderState = { lastFiredAt: number | null; lastDoneAt: number | null; skipDate: string | null }`
  - `listReminders(db): Reminder[]` (seeds built-ins when none exist), `getReminder(db, id): Reminder | null`, `saveReminder(db, input: ReminderInput): { ok: true; id: number } | { ok: false; error: string }`, `setEnabled(db, id, on: boolean)`, `deleteReminder(db, id): boolean`, `getStates(db): Map<number, ReminderState>`, `markFired(db, id, nowMs)`, `markDone(db, id, nowMs)`, `skipToday(db, id, nowMs)`, `logWater(db, nowMs)`, `waterToday(db, nowMs): number`.

- [ ] **Step 1: Write the failing tests**

Replace the first test in `apps/mobile/src/db/schema.test.ts` and add the upgrade test (keep the other two tests):

```ts
import { describe, expect, it } from 'vitest';
import { makeRawTestDb, makeTestDb } from './testDb';
import { migrate, MIGRATIONS, SCHEMA_VERSION } from './schema';

describe('migrate', () => {
  it('creates every table and records the version', async () => {
    const db = await makeTestDb();
    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
    expect(tables).toEqual(['apps', 'ingest_state', 'mood_log', 'pickups', 'reminder_state', 'reminders', 'sessions', 'settings', 'water_log']);
    expect(SCHEMA_VERSION).toBe(2);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(2);
  });

  it('upgrades a version-1 database and keeps its data', async () => {
    const db = await makeRawTestDb();
    db.exec(MIGRATIONS[0]);
    db.exec('PRAGMA user_version = 1');
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.a', 1, 2, '2026-10-06')");
    migrate(db);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(2);
    expect(db.all('SELECT * FROM sessions')).toHaveLength(1);
    expect(db.all('SELECT * FROM reminders')).toEqual([]);
  });
  // …keep 'is safe to run twice' and 'ignores a duplicate session…'
});
```

`apps/mobile/src/reminders/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { deleteEverything } from '../settings/data';
import {
  deleteReminder, getReminder, getStates, listReminders, logWater, markDone, markFired, saveReminder, setEnabled, skipToday, waterToday
} from './store';

const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();
const custom = { name: 'Stretch', message: 'Up you get', animation: 'stretch' as const, schedule: { type: 'interval' as const, minutes: 45 }, breakSec: 0 };

describe('reminder store', () => {
  it('seeds the four built-ins once', async () => {
    const db = await makeTestDb();
    expect(listReminders(db).map((r) => r.builtin)).toEqual(['water', 'lunch', 'tea', 'dinner']);
    expect(listReminders(db)).toHaveLength(4);
    expect(listReminders(db).find((r) => r.builtin === 'tea')!.breakSec).toBe(300);
  });

  it('saves, edits and deletes a custom reminder; built-ins cannot be deleted', async () => {
    const db = await makeTestDb();
    listReminders(db);
    const saved = saveReminder(db, custom);
    expect(saved.ok).toBe(true);
    const id = (saved as { ok: true; id: number }).id;
    expect(getReminder(db, id)).toMatchObject({ builtin: null, name: 'Stretch', enabled: true, schedule: { type: 'interval', minutes: 45 } });
    expect(saveReminder(db, { ...custom, id, name: 'Walk' })).toEqual({ ok: true, id });
    expect(getReminder(db, id)!.name).toBe('Walk');
    const water = listReminders(db).find((r) => r.builtin === 'water')!;
    expect(deleteReminder(db, water.id)).toBe(false);
    expect(deleteReminder(db, id)).toBe(true);
    expect(getReminder(db, id)).toBeNull();
  });

  it('rejects invalid input and a 21st custom reminder', async () => {
    const db = await makeTestDb();
    expect(saveReminder(db, { ...custom, name: '  ' })).toEqual({ ok: false, error: 'Give it a name.' });
    for (let i = 0; i < 20; i++) expect(saveReminder(db, { ...custom, name: `R${i}` }).ok).toBe(true);
    expect(saveReminder(db, { ...custom, name: 'One too many' })).toEqual({ ok: false, error: 'You can have up to 20 of your own reminders.' });
  });

  it('switches reminders on and off', async () => {
    const db = await makeTestDb();
    const dinner = listReminders(db).find((r) => r.builtin === 'dinner')!;
    setEnabled(db, dinner.id, true);
    expect(getReminder(db, dinner.id)!.enabled).toBe(true);
  });

  it('records fired, done and skip-today state', async () => {
    const db = await makeTestDb();
    const lunch = listReminders(db).find((r) => r.builtin === 'lunch')!;
    markFired(db, lunch.id, at(13));
    markDone(db, lunch.id, at(13, 20));
    skipToday(db, lunch.id, at(9));
    expect(getStates(db).get(lunch.id)).toEqual({ lastFiredAt: at(13), lastDoneAt: at(13, 20), skipDate: '2026-10-06' });
  });

  it('counts today’s glasses of water', async () => {
    const db = await makeTestDb();
    logWater(db, at(9));
    logWater(db, at(11));
    logWater(db, at(9, 0, 5));
    expect(waterToday(db, at(12))).toBe(2);
  });

  it('comes back to the defaults after Delete everything', async () => {
    const db = await makeTestDb();
    saveReminder(db, custom);
    deleteEverything(db, at(12));
    expect(listReminders(db).map((r) => r.builtin)).toEqual(['water', 'lunch', 'tea', 'dinner']);
  });
});
```

In `apps/mobile/src/settings/data.test.ts`, change the export test's key expectation to

```ts
expect(Object.keys(out).sort()).toEqual(['apps', 'exportedAt', 'mood_log', 'pickups', 'reminder_state', 'reminders', 'sessions', 'settings', 'water_log']);
```

and in the "deletes everything" test change the table loop to
`for (const t of ['sessions', 'pickups', 'apps', 'mood_log', 'settings', 'reminders', 'reminder_state', 'water_log'])`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — `makeRawTestDb`/`MIGRATIONS` not exported, `./store` missing, wrong table lists.

- [ ] **Step 3: Implement the schema, test db and settings changes**

In `apps/mobile/src/db/schema.ts`: export the array (`export const MIGRATIONS: string[] = [`) and append a second entry:

```ts
  `CREATE TABLE reminders (id INTEGER PRIMARY KEY, builtin TEXT UNIQUE, name TEXT NOT NULL, message TEXT NOT NULL, animation TEXT NOT NULL, schedule TEXT NOT NULL, break_sec INTEGER NOT NULL, enabled INTEGER NOT NULL);
   CREATE TABLE reminder_state (id INTEGER PRIMARY KEY, last_fired_at INTEGER, last_done_at INTEGER, skip_date TEXT);
   CREATE TABLE water_log (ts_ms INTEGER PRIMARY KEY, day TEXT NOT NULL);
   CREATE INDEX water_log_day ON water_log(day);`
```

In `apps/mobile/src/db/testDb.ts` split creation from migration:

```ts
/** In-memory database without migrations (for upgrade tests). */
export async function makeRawTestDb(): Promise<Db> {
  // …the existing body of makeTestDb, minus the migrate(db) call…
}

/** In-memory migrated database for tests (sql.js — no native build needed). */
export async function makeTestDb(): Promise<Db> {
  const db = await makeRawTestDb();
  migrate(db);
  return db;
}
```

In `apps/mobile/src/db/settings.ts` `DEFAULTS`, add:

```ts
  clock_plan: '',
  last_response: ''
```

- [ ] **Step 4: Implement the store**

`apps/mobile/src/reminders/store.ts`:

```ts
import { localDate } from '@worksight/core/date';
import { LIMITS, validateReminder, type Animation, type Reminder, type ReminderInput, type Schedule } from '@worksight/core/reminders';
import type { Db } from '../db/db';
import { mobileDefaults } from './defaults';

type Row = { id: number; builtin: string | null; name: string; message: string; animation: string; schedule: string; break_sec: number; enabled: number };
export type ReminderState = { lastFiredAt: number | null; lastDoneAt: number | null; skipDate: string | null };

const toReminder = (r: Row): Reminder => ({
  id: r.id, builtin: r.builtin as Reminder['builtin'], name: r.name, message: r.message, animation: r.animation as Animation,
  schedule: JSON.parse(r.schedule) as Schedule, breakSec: r.break_sec, enabled: r.enabled === 1
});

/** Built-ins first (water, lunch, tea, dinner), then the user's own. Seeds the built-ins on first use and after Delete everything. */
export function listReminders(db: Db): Reminder[] {
  if (!db.get('SELECT 1 AS x FROM reminders WHERE builtin IS NOT NULL LIMIT 1')) {
    // INSERT OR IGNORE on the unique builtin column keeps this idempotent without a transaction (callers may be inside one).
    for (const d of mobileDefaults()) {
      db.run('INSERT OR IGNORE INTO reminders (builtin, name, message, animation, schedule, break_sec, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [d.builtin, d.name, d.message, d.animation, JSON.stringify(d.schedule), d.breakSec, d.enabled ? 1 : 0]);
    }
  }
  return db.all<Row>('SELECT * FROM reminders ORDER BY builtin IS NULL, id').map(toReminder);
}

export function getReminder(db: Db, id: number): Reminder | null {
  const r = db.get<Row>('SELECT * FROM reminders WHERE id = ?', [id]);
  return r ? toReminder(r) : null;
}

export function saveReminder(db: Db, input: ReminderInput): { ok: true; id: number } | { ok: false; error: string } {
  const error = validateReminder(input);
  if (error) return { ok: false, error };
  const vals = [input.name.trim(), input.message.trim(), input.animation, JSON.stringify(input.schedule), input.breakSec];
  if (input.id) {
    db.run('UPDATE reminders SET name = ?, message = ?, animation = ?, schedule = ?, break_sec = ? WHERE id = ?', [...vals, input.id]);
    return { ok: true, id: input.id };
  }
  const customs = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM reminders WHERE builtin IS NULL')?.n ?? 0;
  if (customs >= LIMITS.custom) return { ok: false, error: 'You can have up to 20 of your own reminders.' };
  db.run('INSERT INTO reminders (builtin, name, message, animation, schedule, break_sec, enabled) VALUES (NULL, ?, ?, ?, ?, ?, 1)', vals);
  return { ok: true, id: db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id };
}

export function setEnabled(db: Db, id: number, on: boolean): void {
  db.run('UPDATE reminders SET enabled = ? WHERE id = ?', [on ? 1 : 0, id]);
}

/** Only the user's own reminders can be deleted. */
export function deleteReminder(db: Db, id: number): boolean {
  if (!db.get('SELECT 1 AS x FROM reminders WHERE id = ? AND builtin IS NULL', [id])) return false;
  db.run('DELETE FROM reminders WHERE id = ?', [id]);
  db.run('DELETE FROM reminder_state WHERE id = ?', [id]);
  return true;
}

export function getStates(db: Db): Map<number, ReminderState> {
  const rows = db.all<{ id: number; last_fired_at: number | null; last_done_at: number | null; skip_date: string | null }>('SELECT * FROM reminder_state');
  return new Map(rows.map((r) => [r.id, { lastFiredAt: r.last_fired_at, lastDoneAt: r.last_done_at, skipDate: r.skip_date }]));
}

function setState(db: Db, id: number, column: 'last_fired_at' | 'last_done_at' | 'skip_date', value: number | string): void {
  db.run(`INSERT INTO reminder_state (id, ${column}) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET ${column} = excluded.${column}`, [id, value]);
}

export const markFired = (db: Db, id: number, nowMs: number) => setState(db, id, 'last_fired_at', nowMs);
export const markDone = (db: Db, id: number, nowMs: number) => setState(db, id, 'last_done_at', nowMs);
export const skipToday = (db: Db, id: number, nowMs: number) => setState(db, id, 'skip_date', localDate(nowMs));

export function logWater(db: Db, nowMs: number): void {
  db.run('INSERT OR IGNORE INTO water_log (ts_ms, day) VALUES (?, ?)', [nowMs, localDate(nowMs)]);
}

export function waterToday(db: Db, nowMs: number): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM water_log WHERE day = ?', [localDate(nowMs)])?.n ?? 0;
}
```

- [ ] **Step 5: Include the new tables in export and delete**

In `apps/mobile/src/settings/data.ts`:
- in `exportJson`, add
  ```ts
      reminders: db.all('SELECT id, builtin, name, message, animation, schedule, break_sec, enabled FROM reminders ORDER BY id'),
      reminder_state: db.all('SELECT id, last_fired_at, last_done_at, skip_date FROM reminder_state ORDER BY id'),
      water_log: db.all('SELECT ts_ms, day FROM water_log ORDER BY ts_ms'),
  ```
- in `deleteEverything`, change the table list to
  `['sessions', 'pickups', 'apps', 'ingest_state', 'mood_log', 'settings', 'reminders', 'reminder_state', 'water_log']`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/db apps/mobile/src/reminders/store.ts apps/mobile/src/reminders/store.test.ts apps/mobile/src/settings
git commit -m "feat(mobile): reminders schema v2 and reminder store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reminder planning (pure)

**Files:**
- Create: `apps/mobile/src/reminders/plan.ts`
- Modify: `apps/mobile/src/tracking/sync.ts` (add `phoneMsSince`)
- Test: `apps/mobile/src/reminders/plan.test.ts`, `apps/mobile/src/tracking/sync.test.ts` (add one test)

**Interfaces:**
- Consumes: `Reminder`, `localDayOf`, `localDate`, `ReminderState`, `loadState`.
- Produces:
  - `phoneMsSince(db: Db, fromMs: number, nowMs: number): number` — phone time in `[fromMs, nowMs]`: finished sessions clipped to the window plus the open app.
  - `type ClockSlot = { key: string; reminderId: number; atMs: number }`
  - `planClockSlots(reminders: Reminder[], states: Map<number, ReminderState>, nowMs: number, days?: number): ClockSlot[]` (default 7 days, sorted by time)
  - `dueIntervalReminders(reminders, states, nowMs, phoneMsSince: (fromMs: number) => number): Reminder[]`
  - `type NextUp = { reminder: Reminder; kind: 'clock'; atMs: number } | { reminder: Reminder; kind: 'interval'; leftMin: number }`
  - `nextUp(reminders, states, nowMs, phoneMsSince: (fromMs: number) => number): NextUp | null`

- [ ] **Step 1: Write the failing tests**

Add to `apps/mobile/src/tracking/sync.test.ts` (inside the `describe('sync', …)` block; uses that file's `at`, `fakeNative`, `makeTestDb` and `sync`):

```ts
  it('measures phone time since a moment, clipping sessions and counting the open app', async () => {
    const db = await makeTestDb();
    await sync(db, fakeNative([
      { type: 'resumed', pkg: 'com.a', ts: at(9) },
      { type: 'paused', pkg: 'com.a', ts: at(9, 30) },
      { type: 'resumed', pkg: 'com.b', ts: at(10) }
    ]), at(10, 20));
    expect(phoneMsSince(db, at(9, 10), at(10, 20))).toBe((20 + 20) * 60_000);
    expect(phoneMsSince(db, at(10, 10), at(10, 20))).toBe(10 * 60_000);
  });
```

(add `phoneMsSince` to that file's import from `./sync`).

`apps/mobile/src/reminders/plan.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { Reminder } from '@worksight/core/reminders';
import { dueIntervalReminders, nextUp, planClockSlots } from './plan';
import type { ReminderState } from './store';

// Tue 6 Oct 2026 in Asia/Kolkata (vitest.setup.ts).
const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();
const base = { message: 'm', animation: 'meal' as const, breakSec: 300, enabled: true, builtin: null };
const lunch: Reminder = { ...base, id: 1, name: 'Lunch', schedule: { type: 'time', time: '13:00', days: [1, 2, 3, 4, 5] } };
const water: Reminder = { ...base, id: 2, name: 'Water', animation: 'water', schedule: { type: 'interval', minutes: 60 } };
const none = new Map<number, ReminderState>();

describe('planClockSlots', () => {
  it('plans the weekday slots of the next 7 days, today included when still ahead', () => {
    const slots = planClockSlots([lunch, water], none, at(10));
    expect(slots.map((s) => s.key)).toEqual(['rem-1-2026-10-06', 'rem-1-2026-10-07', 'rem-1-2026-10-08', 'rem-1-2026-10-09', 'rem-1-2026-10-12']);
    expect(slots[0].atMs).toBe(at(13));
  });

  it('drops a slot that has passed, a skipped day and disabled reminders', () => {
    expect(planClockSlots([lunch], none, at(14))[0].key).toBe('rem-1-2026-10-07');
    const skipped = new Map<number, ReminderState>([[1, { lastFiredAt: null, lastDoneAt: null, skipDate: '2026-10-06' }]]);
    expect(planClockSlots([lunch], skipped, at(10))[0].key).toBe('rem-1-2026-10-07');
    expect(planClockSlots([{ ...lunch, enabled: false }], none, at(10))).toEqual([]);
  });

  describe('time zone change (Review Focus 1)', () => {
    const original = process.env.TZ;
    afterEach(() => { process.env.TZ = original; });
    it('re-plans to the same local time in the new zone', () => {
      const now = Date.UTC(2026, 9, 6, 3, 0); // 08:30 in Kolkata, 04:00 in London
      const kolkata = planClockSlots([lunch], none, now)[0].atMs;
      process.env.TZ = 'Europe/London';
      const london = planClockSlots([lunch], none, now)[0].atMs;
      expect(new Date(kolkata).toISOString()).toBe('2026-10-06T07:30:00.000Z');
      expect(new Date(london).toISOString()).toBe('2026-10-06T12:00:00.000Z');
    });
  });
});

describe('dueIntervalReminders', () => {
  it('fires after enough phone time since midnight, the last fire or the last done', () => {
    const since = (from: number) => (from <= at(0) ? 70 : 30) * 60_000;
    expect(dueIntervalReminders([water, lunch], none, at(12), since).map((r) => r.id)).toEqual([2]);
    const done = new Map<number, ReminderState>([[2, { lastFiredAt: null, lastDoneAt: at(11), skipDate: null }]]);
    expect(dueIntervalReminders([water], done, at(12), since)).toEqual([]);
    expect(dueIntervalReminders([{ ...water, enabled: false }], none, at(12), since)).toEqual([]);
  });
});

describe('nextUp', () => {
  const since = () => 20 * 60_000;
  it('prefers a clock reminder still to come today', () => {
    expect(nextUp([lunch, water], none, at(10), since)).toEqual({ reminder: lunch, kind: 'clock', atMs: at(13) });
  });
  it('otherwise shows the phone-time reminder with the least left', () => {
    expect(nextUp([lunch, water], none, at(14), since)).toEqual({ reminder: water, kind: 'interval', leftMin: 40 });
  });
  it('otherwise the next clock slot on a later day, or nothing', () => {
    expect(nextUp([lunch], none, at(14), since)).toEqual({ reminder: lunch, kind: 'clock', atMs: at(13, 0, 7) });
    expect(nextUp([], none, at(14), since)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — `./plan` missing, `phoneMsSince` not exported.

- [ ] **Step 3: Implement `phoneMsSince`**

Append to `apps/mobile/src/tracking/sync.ts`:

```ts
/** Phone time between fromMs and nowMs: finished sessions clipped to the window, plus the open app. */
export function phoneMsSince(db: Db, fromMs: number, nowMs: number): number {
  const done = db.get<{ ms: number | null }>(
    'SELECT SUM(MIN(end_ms, ?) - MAX(start_ms, ?)) AS ms FROM sessions WHERE end_ms > ? AND start_ms < ?',
    [nowMs, fromMs, fromMs, nowMs]
  )?.ms ?? 0;
  const s = loadState(db);
  if (s.openPkg === null || s.openStartMs === null) return done;
  return done + Math.max(0, nowMs - Math.max(s.openStartMs, fromMs));
}
```

- [ ] **Step 4: Implement the plan**

`apps/mobile/src/reminders/plan.ts`:

```ts
import { localDate } from '@worksight/core/date';
import { localDayOf, type Reminder } from '@worksight/core/reminders';
import type { ReminderState } from './store';

export type ClockSlot = { key: string; reminderId: number; atMs: number };
export type NextUp = { reminder: Reminder; kind: 'clock'; atMs: number } | { reminder: Reminder; kind: 'interval'; leftMin: number };

const midnightOf = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0);

/** Local fire times of every enabled clock reminder from now through `days` days. Planned in the current zone, so
 * re-planning after a time-zone or DST change moves every alarm to the right local time. */
export function planClockSlots(reminders: Reminder[], states: Map<number, ReminderState>, nowMs: number, days = 7): ClockSlot[] {
  const out: ClockSlot[] = [];
  const first = new Date(midnightOf(nowMs));
  for (let i = 0; i < days; i++) {
    const day = new Date(first);
    day.setDate(first.getDate() + i); // calendar stepping, not +24 h, so DST days stay right
    const dayMs = day.getTime();
    const dayKey = localDate(dayMs);
    const dow = localDayOf(dayMs);
    for (const r of reminders) {
      if (!r.enabled || r.schedule.type !== 'time' || !r.schedule.days.includes(dow)) continue;
      if (states.get(r.id)?.skipDate === dayKey) continue;
      const [h, m] = r.schedule.time.split(':').map(Number);
      const atMs = new Date(dayMs).setHours(h, m, 0, 0);
      if (atMs > nowMs) out.push({ key: `rem-${r.id}-${dayKey}`, reminderId: r.id, atMs });
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

const intervalFrom = (r: Reminder, s: ReminderState | undefined, nowMs: number): number =>
  Math.max(midnightOf(nowMs), s?.lastFiredAt ?? 0, s?.lastDoneAt ?? 0);

/** Phone-time reminders with enough phone time since the later of local midnight, their last fire and last done. */
export function dueIntervalReminders(reminders: Reminder[], states: Map<number, ReminderState>, nowMs: number, phoneMsSince: (fromMs: number) => number): Reminder[] {
  return reminders.filter((r) => r.enabled && r.schedule.type === 'interval'
    && phoneMsSince(intervalFrom(r, states.get(r.id), nowMs)) >= r.schedule.minutes * 60_000);
}

/** The Reminders tab's "Next up": a clock reminder still to come today, else the phone-time reminder closest to due,
 * else the next clock reminder on a later day. */
export function nextUp(reminders: Reminder[], states: Map<number, ReminderState>, nowMs: number, phoneMsSince: (fromMs: number) => number): NextUp | null {
  const byId = new Map(reminders.map((r) => [r.id, r]));
  const slots = planClockSlots(reminders, states, nowMs, 8);
  const today = slots.find((s) => localDate(s.atMs) === localDate(nowMs));
  if (today) return { reminder: byId.get(today.reminderId)!, kind: 'clock', atMs: today.atMs };
  let best: NextUp | null = null;
  for (const r of reminders) {
    if (!r.enabled || r.schedule.type !== 'interval') continue;
    const leftMin = Math.max(0, Math.round(r.schedule.minutes - phoneMsSince(intervalFrom(r, states.get(r.id), nowMs)) / 60_000));
    if (!best || (best.kind === 'interval' && leftMin < best.leftMin)) best = { reminder: r, kind: 'interval', leftMin };
  }
  if (best) return best;
  return slots[0] ? { reminder: byId.get(slots[0].reminderId)!, kind: 'clock', atMs: slots[0].atMs } : null;
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`
Expected: all pass (the time-zone test restores `TZ` afterwards).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/reminders/plan.ts apps/mobile/src/reminders/plan.test.ts apps/mobile/src/tracking/sync.ts apps/mobile/src/tracking/sync.test.ts
git commit -m "feat(mobile): plan clock reminders and due phone-time reminders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reminder tick and notification actions (behind a `Notifier`)

**Files:**
- Create: `apps/mobile/src/reminders/notifier.ts`, `src/reminders/tick.ts`, `src/reminders/actions.ts`
- Test: `apps/mobile/src/reminders/tick.test.ts`, `src/reminders/actions.test.ts`, `src/reminders/fakeNotifier.ts` (test helper)

**Interfaces:**
- Consumes: store functions, `planClockSlots`, `dueIntervalReminders`, `phoneMsSince`, `getSetting`/`setSetting`, `reminderTitle`, `sceneKind`.
- Produces:
  - `type ReminderCategory = 'water' | 'break' | 'nudge'`
  - `type ReminderContent = { reminderId: number; title: string; body: string; category: ReminderCategory }`
  - `interface Notifier { scheduleAt(key: string, content: ReminderContent, atMs: number): Promise<void>; showNow(key: string, content: ReminderContent): Promise<void>; cancel(key: string): Promise<void>; scheduledKeys(): Promise<string[]>; dismiss(key: string): Promise<void> }`
  - `reminderContent(r: Reminder): ReminderContent`
  - `tickReminders(db: Db, notifier: Notifier, nowMs: number): Promise<{ replanned: boolean; fired: number[] }>`
  - `DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT'`, `SNOOZE_MS = 15 * 60_000`
  - `type ReminderAction = { actionId: string; reminderId: number; notificationKey: string; firedAtMs: number }` (`actionId` is `'water' | 'done' | 'snooze' | 'break' | 'open'` from Daily's notifications)
  - `fromResponse(r: { actionIdentifier: string; notification: { date: number; request: { identifier: string; content: { data?: Record<string, unknown> | null } } } }): ReminderAction | null`
  - `type OpenTarget = { route: '/break'; reminderId: number } | { route: '/reminders' } | null`
  - `handleReminderAction(db: Db, notifier: Notifier, a: ReminderAction, nowMs: number): Promise<OpenTarget>`

- [ ] **Step 1: Test helper**

`apps/mobile/src/reminders/fakeNotifier.ts`:

```ts
import type { Notifier, ReminderContent } from './notifier';

/** Records what Daily asked the OS to do. Test-only. */
export class FakeNotifier implements Notifier {
  scheduled = new Map<string, { content: ReminderContent; atMs: number }>();
  shown: { key: string; content: ReminderContent }[] = [];
  dismissed: string[] = [];
  async scheduleAt(key: string, content: ReminderContent, atMs: number) { this.scheduled.set(key, { content, atMs }); }
  async showNow(key: string, content: ReminderContent) { this.shown.push({ key, content }); }
  async cancel(key: string) { this.scheduled.delete(key); }
  async scheduledKeys() { return [...this.scheduled.keys()]; }
  async dismiss(key: string) { this.dismissed.push(key); }
}
```

- [ ] **Step 2: Write the failing tests**

`apps/mobile/src/reminders/tick.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { deleteEverything } from '../settings/data';
import { FakeNotifier } from './fakeNotifier';
import { listReminders, saveReminder, setEnabled } from './store';
import { tickReminders } from './tick';

const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();

async function setup() {
  const db = await makeTestDb();
  const n = new FakeNotifier();
  const byName = (b: string) => listReminders(db).find((r) => r.builtin === b)!;
  return { db, n, byName };
}

describe('tickReminders', () => {
  it('schedules the 7-day clock plan once and leaves it alone while unchanged', async () => {
    const { db, n, byName } = await setup();
    const first = await tickReminders(db, n, at(10));
    expect(first.replanned).toBe(true);
    const lunch = byName('lunch');
    expect(n.scheduled.get(`rem-${lunch.id}-2026-10-06`)?.atMs).toBe(at(13));
    expect([...n.scheduled.keys()].filter((k) => k.startsWith(`rem-${lunch.id}-`))).toHaveLength(5);
    expect((await tickReminders(db, n, at(10, 1))).replanned).toBe(false);
  });

  it('replaces the old alarm when a reminder is edited or switched off (Review Focus 4)', async () => {
    const { db, n, byName } = await setup();
    await tickReminders(db, n, at(10));
    const tea = byName('tea');
    saveReminder(db, { id: tea.id, name: tea.name, message: tea.message, animation: tea.animation, schedule: { type: 'time', time: '17:00', days: [2] }, breakSec: tea.breakSec });
    await tickReminders(db, n, at(10, 1));
    expect(n.scheduled.get(`rem-${tea.id}-2026-10-06`)?.atMs).toBe(at(17));
    expect([...n.scheduled.keys()].filter((k) => k.startsWith(`rem-${tea.id}-`))).toEqual([`rem-${tea.id}-2026-10-06`]);
    setEnabled(db, tea.id, false);
    await tickReminders(db, n, at(10, 2));
    expect([...n.scheduled.keys()].some((k) => k.startsWith(`rem-${tea.id}-`))).toBe(false);
  });

  it('never cancels a snooze when re-planning (Review Focus 3)', async () => {
    const { db, n, byName } = await setup();
    await n.scheduleAt('snooze-7', { reminderId: 7, title: 't', body: 'b', category: 'break' }, at(10, 15));
    setEnabled(db, byName('dinner').id, true);
    await tickReminders(db, n, at(10));
    expect(n.scheduled.has('snooze-7')).toBe(true);
  });

  it('fires a due phone-time reminder now and only once', async () => {
    const { db, n, byName } = await setup();
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.a', ?, ?, '2026-10-06')", [at(9), at(10, 5)]);
    const first = await tickReminders(db, n, at(10, 10));
    expect(first.fired).toEqual([byName('water').id]);
    expect(n.shown.map((s) => s.content.category)).toEqual(['water']);
    expect((await tickReminders(db, n, at(10, 11))).fired).toEqual([]);
  });

  it('re-plans after Delete everything (Review Focus 5)', async () => {
    const { db, n } = await setup();
    await tickReminders(db, n, at(10));
    deleteEverything(db, at(10, 5));
    expect((await tickReminders(db, n, at(10, 6))).replanned).toBe(true);
    const lunch = listReminders(db).find((r) => r.builtin === 'lunch')!;
    expect(n.scheduled.has(`rem-${lunch.id}-2026-10-06`)).toBe(true);
  });
});
```

`apps/mobile/src/reminders/actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { DEFAULT_ACTION, fromResponse, handleReminderAction, SNOOZE_MS } from './actions';
import { FakeNotifier } from './fakeNotifier';
import { getStates, listReminders, waterToday } from './store';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();

async function setup() {
  const db = await makeTestDb();
  const reminders = listReminders(db);
  const id = (b: string) => reminders.find((r) => r.builtin === b)!.id;
  return { db, n: new FakeNotifier(), id };
}

describe('fromResponse', () => {
  it('reads Daily’s reminder id and maps a body tap to "open"', () => {
    const r = { actionIdentifier: DEFAULT_ACTION, notification: { date: at(13), request: { identifier: 'rem-2-2026-10-06', content: { data: { reminderId: 2 } } } } };
    expect(fromResponse(r)).toEqual({ actionId: 'open', reminderId: 2, notificationKey: 'rem-2-2026-10-06', firedAtMs: at(13) });
    expect(fromResponse({ ...r, notification: { ...r.notification, request: { identifier: 'x', content: { data: null } } } })).toBeNull();
  });
});

describe('handleReminderAction', () => {
  it('"I had some" logs a glass, marks water done and clears the notification', async () => {
    const { db, n, id } = await setup();
    const open = await handleReminderAction(db, n, { actionId: 'water', reminderId: id('water'), notificationKey: 'now-1', firedAtMs: at(11) }, at(11, 1));
    expect(open).toBeNull();
    expect(waterToday(db, at(12))).toBe(1);
    expect(getStates(db).get(id('water'))?.lastDoneAt).toBe(at(11, 1));
    expect(n.dismissed).toEqual(['now-1']);
  });

  it('handles the same response only once (Review Focus 2)', async () => {
    const { db, n, id } = await setup();
    const a = { actionId: 'water', reminderId: id('water'), notificationKey: 'now-1', firedAtMs: at(11) };
    await handleReminderAction(db, n, a, at(11, 1));
    await handleReminderAction(db, n, a, at(11, 2));
    expect(waterToday(db, at(12))).toBe(1);
    const open = { actionId: 'break', reminderId: id('lunch'), notificationKey: 'rem-x', firedAtMs: at(13) };
    expect(await handleReminderAction(db, n, open, at(13, 1))).toEqual({ route: '/break', reminderId: id('lunch') });
    expect(await handleReminderAction(db, n, open, at(13, 2))).toBeNull();
  });

  it('snoozes for 15 minutes under its own key', async () => {
    const { db, n, id } = await setup();
    await handleReminderAction(db, n, { actionId: 'snooze', reminderId: id('tea'), notificationKey: 'rem-t', firedAtMs: at(16) }, at(16, 1));
    expect(n.scheduled.get(`snooze-${id('tea')}`)?.atMs).toBe(at(16, 1) + SNOOZE_MS);
  });

  it('a body tap opens the break, or Reminders for a no-break nudge; unknown reminders do nothing', async () => {
    const { db, n, id } = await setup();
    expect(await handleReminderAction(db, n, { actionId: 'open', reminderId: id('lunch'), notificationKey: 'a', firedAtMs: 1 }, at(13))).toEqual({ route: '/break', reminderId: id('lunch') });
    db.run('UPDATE reminders SET break_sec = 0 WHERE id = ?', [id('tea')]);
    expect(await handleReminderAction(db, n, { actionId: 'open', reminderId: id('tea'), notificationKey: 'b', firedAtMs: 2 }, at(16))).toEqual({ route: '/reminders' });
    expect(await handleReminderAction(db, n, { actionId: 'open', reminderId: 999, notificationKey: 'c', firedAtMs: 3 }, at(16))).toBeNull();
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — `./notifier`, `./tick`, `./actions` missing.

- [ ] **Step 4: Implement**

`apps/mobile/src/reminders/notifier.ts`:

```ts
import { reminderTitle, type Reminder } from '@worksight/core/reminders';

export type ReminderCategory = 'water' | 'break' | 'nudge';
export type ReminderContent = { reminderId: number; title: string; body: string; category: ReminderCategory };

/** What Daily asks the OS for. expoNotifier implements it; tests use FakeNotifier. */
export interface Notifier {
  scheduleAt(key: string, content: ReminderContent, atMs: number): Promise<void>;
  showNow(key: string, content: ReminderContent): Promise<void>;
  cancel(key: string): Promise<void>;
  scheduledKeys(): Promise<string[]>;
  dismiss(key: string): Promise<void>;
}

export function reminderContent(r: Reminder): ReminderContent {
  const category: ReminderCategory = r.builtin === 'water' ? 'water' : r.breakSec > 0 ? 'break' : 'nudge';
  return { reminderId: r.id, title: reminderTitle(r), body: r.message, category };
}
```

`apps/mobile/src/reminders/tick.ts`:

```ts
import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import { phoneMsSince } from '../tracking/sync';
import { reminderContent, type Notifier } from './notifier';
import { dueIntervalReminders, planClockSlots } from './plan';
import { getStates, listReminders, markFired } from './store';

/** Keeps the OS alarms equal to the 7-day clock plan (touching them only when the plan changed) and fires any
 * phone-time reminder that is due. Called after every sync. */
export async function tickReminders(db: Db, notifier: Notifier, nowMs: number): Promise<{ replanned: boolean; fired: number[] }> {
  const reminders = listReminders(db);
  const states = getStates(db);
  const byId = new Map(reminders.map((r) => [r.id, r]));

  const slots = planClockSlots(reminders, states, nowMs);
  const signature = slots.map((s) => {
    const c = reminderContent(byId.get(s.reminderId)!);
    return `${s.key}@${s.atMs}:${c.title}|${c.body}|${c.category}`;
  }).join('\n');
  const replanned = signature !== getSetting(db, 'clock_plan');
  if (replanned) {
    for (const key of await notifier.scheduledKeys()) if (key.startsWith('rem-')) await notifier.cancel(key);
    for (const s of slots) await notifier.scheduleAt(s.key, reminderContent(byId.get(s.reminderId)!), s.atMs);
    setSetting(db, 'clock_plan', signature);
  }

  const due = dueIntervalReminders(reminders, states, nowMs, (fromMs) => phoneMsSince(db, fromMs, nowMs));
  for (const r of due) {
    await notifier.showNow(`now-${r.id}`, reminderContent(r));
    markFired(db, r.id, nowMs);
  }
  return { replanned, fired: due.map((r) => r.id) };
}
```

`apps/mobile/src/reminders/actions.ts`:

```ts
import type { Db } from '../db/db';
import { getSetting, setSetting } from '../db/settings';
import { reminderContent, type Notifier } from './notifier';
import { getReminder, logWater, markDone } from './store';

/** expo-notifications' id for a tap on the notification body (kept here so this file never imports expo). */
export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';
export const SNOOZE_MS = 15 * 60_000;

export type ReminderAction = { actionId: string; reminderId: number; notificationKey: string; firedAtMs: number };
export type OpenTarget = { route: '/break'; reminderId: number } | { route: '/reminders' } | null;

type ResponseLike = { actionIdentifier: string; notification: { date: number; request: { identifier: string; content: { data?: Record<string, unknown> | null } } } };

export function fromResponse(r: ResponseLike): ReminderAction | null {
  const reminderId = Number(r.notification.request.content.data?.reminderId);
  if (!Number.isInteger(reminderId)) return null;
  return {
    actionId: r.actionIdentifier === DEFAULT_ACTION ? 'open' : r.actionIdentifier,
    reminderId,
    notificationKey: r.notification.request.identifier,
    firedAtMs: r.notification.date
  };
}

/** One handler for both the in-app listener and the background action task. The same response can reach both (and
 * the last response survives an app restart), so it is handled once, remembered in settings. */
export async function handleReminderAction(db: Db, notifier: Notifier, a: ReminderAction, nowMs: number): Promise<OpenTarget> {
  const tag = `${a.notificationKey}|${a.actionId}|${a.firedAtMs}`;
  if (getSetting(db, 'last_response') === tag) return null;
  setSetting(db, 'last_response', tag);
  const r = getReminder(db, a.reminderId);
  if (!r) return null;
  if (a.actionId !== 'open') await notifier.dismiss(a.notificationKey);
  switch (a.actionId) {
    case 'water': logWater(db, nowMs); markDone(db, r.id, nowMs); return null;
    case 'done': markDone(db, r.id, nowMs); return null;
    case 'snooze': await notifier.scheduleAt(`snooze-${r.id}`, reminderContent(r), nowMs + SNOOZE_MS); return null;
    case 'break': return { route: '/break', reminderId: r.id };
    default: return r.breakSec > 0 ? { route: '/break', reminderId: r.id } : { route: '/reminders' };
  }
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter @worksight/mobile test && pnpm --filter @worksight/mobile typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/reminders
git commit -m "feat(mobile): reminder tick and notification actions behind a Notifier

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire notifications into the app (expo-notifications, exact alarms, background actions)

**Files:**
- Create: `apps/mobile/src/reminders/expoNotifier.ts`, `src/reminders/responseTask.ts`, `src/reminders/useResponses.ts`, `src/reminders/apply.ts`
- Modify: `apps/mobile/index.ts`, `app/_layout.tsx`, `src/tracking/runSync.ts`, `modules/daily-native/index.ts`, `modules/daily-native/android/src/main/AndroidManifest.xml`, `modules/daily-native/android/src/main/java/expo/modules/dailynative/DailyNativeModule.kt`, `package.json`/`app.json` (via `expo install`)

**Interfaces:**
- Consumes: `Notifier`, `ReminderContent`, `tickReminders`, `fromResponse`, `handleReminderAction`, `getDb`, `sync`, `DailyNative`.
- Produces:
  - `REMINDER_CHANNEL = 'reminders'`, `setupNotifications(): Promise<void>`, `expoNotifier: Notifier`
  - `RESPONSE_TASK = 'daily-notification-response'`, `registerResponseTask(): Promise<void>`
  - `useReminderResponses(): void` (in-app handling + navigation)
  - `applyReminders(): Promise<void>` (re-plan now; screens call it after edits)
  - Native: `canScheduleExactAlarms(): boolean`, `openExactAlarmSettings(): void`

- [ ] **Step 1: Install**

```bash
cd apps/mobile && npx expo install expo-notifications && cd ../..
```

Accept the `expo-notifications` config plugin in `app.json` if offered. Then check the root still resolves React 19.2.3 only: `node -p "require('./node_modules/react/package.json').version + ' / ' + require('./node_modules/react-dom/package.json').version"` → `19.2.3 / 19.2.3`.

- [ ] **Step 2: Native exact-alarm support**

In `apps/mobile/modules/daily-native/android/src/main/AndroidManifest.xml`, add next to the usage-stats permission:

```xml
  <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

In `DailyNativeModule.kt`, add imports `android.app.AlarmManager` and `android.net.Uri`, and inside `definition()`:

```kotlin
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < 31) true
      else (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= 31) {
        context.startActivity(
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
    }
```

In `apps/mobile/modules/daily-native/index.ts`, add to `DailyNativeApi`:

```ts
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
```

(expo-notifications already uses exact alarms when Android allows it: `ExpoSchedulingDelegate` checks `canScheduleExactAlarms()`; without the permission, reminders may be a few minutes late.)

- [ ] **Step 3: The expo implementation**

`apps/mobile/src/reminders/expoNotifier.ts`:

```ts
import * as Notifications from 'expo-notifications';
import type { Notifier, ReminderContent } from './notifier';

export const REMINDER_CHANNEL = 'reminders';

/** Foreground display, the Android channel and the three button sets. Safe to call more than once. */
export async function setupNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
  });
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.HIGH });
  const snooze = { identifier: 'snooze', buttonTitle: 'Snooze 15 min', options: { opensAppToForeground: false } };
  const brk = { identifier: 'break', buttonTitle: 'Take a break', options: { opensAppToForeground: true } };
  await Notifications.setNotificationCategoryAsync('water', [
    { identifier: 'water', buttonTitle: 'I had some', options: { opensAppToForeground: false } }, brk, snooze
  ]);
  await Notifications.setNotificationCategoryAsync('break', [brk, snooze]);
  await Notifications.setNotificationCategoryAsync('nudge', [
    { identifier: 'done', buttonTitle: 'Done', options: { opensAppToForeground: false } }, snooze
  ]);
}

const content = (c: ReminderContent): Notifications.NotificationContentInput => ({
  title: c.title, body: c.body, categoryIdentifier: c.category, data: { reminderId: c.reminderId }
});

export const expoNotifier: Notifier = {
  async scheduleAt(key, c, atMs) {
    await Notifications.scheduleNotificationAsync({
      identifier: key, content: content(c),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: atMs, channelId: REMINDER_CHANNEL }
    });
  },
  async showNow(key, c) {
    await Notifications.scheduleNotificationAsync({ identifier: key, content: content(c), trigger: { channelId: REMINDER_CHANNEL } });
  },
  cancel: (key) => Notifications.cancelScheduledNotificationAsync(key),
  scheduledKeys: async () => (await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier),
  dismiss: (key) => Notifications.dismissNotificationAsync(key)
};
```

If a name differs in the installed version, check `node_modules/expo-notifications/build/*.d.ts` and adapt only this file.

`apps/mobile/src/reminders/apply.ts`:

```ts
import { getDb } from '../db/expoDb';
import { expoNotifier } from './expoNotifier';
import { tickReminders } from './tick';

/** Re-plan alarms now (after an edit, a switch, Skip today or onboarding). */
export async function applyReminders(): Promise<void> {
  try { await tickReminders(getDb(), expoNotifier, Date.now()); } catch (e) { console.warn('daily: applying reminders failed', e); }
}
```

`apps/mobile/src/reminders/responseTask.ts`:

```ts
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { getDb } from '../db/expoDb';
import { fromResponse, handleReminderAction } from './actions';
import { expoNotifier } from './expoNotifier';

export const RESPONSE_TASK = 'daily-notification-response';

// Android runs this for a button tap while Daily is in the background or closed ("I had some", "Done", "Snooze").
// Imported from index.ts so it is defined before anything else loads.
TaskManager.defineTask(RESPONSE_TASK, async ({ data }) => {
  try {
    if (!data || typeof data !== 'object' || !('actionIdentifier' in data)) return;
    const a = fromResponse(data as unknown as Parameters<typeof fromResponse>[0]);
    if (a && a.actionId !== 'open' && a.actionId !== 'break') await handleReminderAction(getDb(), expoNotifier, a, Date.now());
  } catch (e) {
    console.warn('daily: background reminder action failed', e);
  }
});

export async function registerResponseTask(): Promise<void> {
  if (!(await TaskManager.isTaskRegisteredAsync(RESPONSE_TASK))) await Notifications.registerTaskAsync(RESPONSE_TASK);
}
```

(Check the payload shape the installed version passes to the task in `build/registerTaskAsync.d.ts` / `NotificationTaskPayload`; if the response is nested, unwrap it before `fromResponse`.)

`apps/mobile/src/reminders/useResponses.ts`:

```ts
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { getDb } from '../db/expoDb';
import { fromResponse, handleReminderAction } from './actions';
import { applyReminders } from './apply';
import { expoNotifier } from './expoNotifier';

/** Taps that reach the running app (and the one that cold-started it). handleReminderAction remembers the last
 * response, so a re-render or an app restart never handles the same tap twice. */
export function useReminderResponses(): void {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    const a = fromResponse(response);
    if (!a) return;
    handleReminderAction(getDb(), expoNotifier, a, Date.now())
      .then((open) => {
        if (open?.route === '/break') router.push({ pathname: '/break', params: { id: String(open.reminderId) } });
        else if (open?.route === '/reminders') router.push('/reminders');
        return applyReminders();
      })
      .catch((e) => console.warn('daily: reminder action failed', e));
  }, [response]);
}
```

- [ ] **Step 4: Hook into app start and sync**

`apps/mobile/index.ts`:

```ts
import './src/tracking/backgroundTask';
import './src/reminders/responseTask';
import 'expo-router/entry';
```

`apps/mobile/src/tracking/runSync.ts`:

```ts
import DailyNative from '../../modules/daily-native';
import { getDb } from '../db/expoDb';
import { expoNotifier } from '../reminders/expoNotifier';
import { tickReminders } from '../reminders/tick';
import { sync } from './sync';

let running: Promise<'ok' | 'no_access'> | null = null;

/** One sync at a time (foreground refresh and background task share it), then the reminder tick — which runs even
 * without usage access so clock reminders still work in reminders-only mode. */
export function runSync(): Promise<'ok' | 'no_access'> {
  running ??= (async () => {
    const result = await sync(getDb(), DailyNative, Date.now());
    await tickReminders(getDb(), expoNotifier, Date.now()).catch((e) => console.warn('daily: reminder tick failed', e));
    return result;
  })().finally(() => { running = null; });
  return running;
}
```

In `apps/mobile/app/_layout.tsx`:
- add imports `import { setupNotifications } from '../src/reminders/expoNotifier';`, `import { registerResponseTask } from '../src/reminders/responseTask';`, `import { useReminderResponses } from '../src/reminders/useResponses';`
- replace the existing `registerSyncTask` effect with

```tsx
  useEffect(() => {
    if (dbError) return;
    registerSyncTask().catch(() => {});
    setupNotifications().then(registerResponseTask).catch((e) => console.warn('daily: notification setup failed', e));
  }, [dbError]);
```

- in `Gate`, call `useReminderResponses();` as its first line, and replace the `<Stack … />` with

```tsx
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="break" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack>
```

Hooks must not be called conditionally: in `Gate`, call `useReminderResponses()` before the onboarding `Redirect` check.

The `/break` and `/reminders` routes are created in Tasks 6 and 7. Until then typed routes may reject `router.push('/break' …)`; if `tsc` does, add minimal placeholder files `app/break.tsx` and `app/(tabs)/reminders.tsx` (each a cream `View` with a title) that Tasks 6 and 7 replace.

- [ ] **Step 5: Typecheck and tests**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`
Expected: no errors; all tests pass.

- [ ] **Step 6: Check on the phone**

Build and install: `cd apps/mobile && npx expo run:android --device RMX2151`. Then:
1. On the phone, Daily must ask for nothing new yet (Android 12 grants notifications by default). Open and close Daily once so `runSync` plans alarms.
2. Temporarily, in Metro's JS console (or a throwaway edit of `useToday`'s refresh that you revert before committing), call `expoNotifier.showNow('now-test', { reminderId: <water id>, title: 'Time for some water', body: 'test', category: 'water' })`. The notification shows three buttons. Tap **I had some** with Daily in the background → no app opens; reopening Daily and checking `water_log` (`adb -s R85H8TTGGULF75UW shell run-as com.aaronalex.daily sqlite3` is usually unavailable — instead add a one-off `console.log(waterToday(getDb(), Date.now()))` and remove it) shows 1. Tap **Take a break** on another test notification → Daily opens (placeholder break screen is fine at this point).
3. `adb -s R85H8TTGGULF75UW shell dumpsys alarm | findstr com.aaronalex.daily` lists Daily's alarms (the lunch/tea slots).
Revert every temporary edit.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): schedule reminder notifications with actions and exact alarms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The break screen and its scenes

**Files:**
- Create: `apps/mobile/src/break/countdown.ts`, `src/break/Scene.tsx`, `app/break.tsx` (replaces any placeholder)
- Test: `apps/mobile/src/break/countdown.test.ts`

**Interfaces:**
- Consumes: `getReminder`, `markDone`, `logWater`, `expoNotifier`, `reminderContent`, `SNOOZE_MS`, `sceneKind`, `ANIM_LOOK`, `MobileAnimation`, `C`, `F`, `getDb`.
- Produces: `formatClock(sec: number): string`, `secondsLeft(startMs: number, totalSec: number, nowMs: number): number`, `ringOffset(leftSec: number, totalSec: number, circumference: number): number`, `<Scene kind: MobileAnimation; size: number />`, route `/break?id=<reminderId>`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/break/countdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatClock, ringOffset, secondsLeft } from './countdown';

describe('countdown', () => {
  it.each([[102, '1:42'], [60, '1:00'], [9, '0:09'], [0, '0:00'], [1800, '30:00']])('%s s → %s', (s, out) => {
    expect(formatClock(s)).toBe(out);
  });
  it('counts down from the start time and never below zero', () => {
    expect(secondsLeft(1_000, 300, 1_000)).toBe(300);
    expect(secondsLeft(1_000, 300, 61_500)).toBe(240);
    expect(secondsLeft(1_000, 300, 999_999)).toBe(0);
  });
  it('empties the ring as time runs out', () => {
    expect(ringOffset(300, 300, 880)).toBe(0);
    expect(ringOffset(150, 300, 880)).toBe(440);
    expect(ringOffset(0, 300, 880)).toBe(880);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — `./countdown` missing.

- [ ] **Step 3: Implement countdown**

`apps/mobile/src/break/countdown.ts`:

```ts
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function secondsLeft(startMs: number, totalSec: number, nowMs: number): number {
  return Math.max(0, totalSec - Math.floor((nowMs - startMs) / 1000));
}

export function ringOffset(leftSec: number, totalSec: number, circumference: number): number {
  return circumference * (1 - leftSec / Math.max(totalSec, 1));
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @worksight/mobile test`
Expected: pass.

- [ ] **Step 5: Scenes** (ported from the desktop's `apps/consumer/src/shared/scenes.ts`; each moving part is its own layer, as in `<Sunny>`)

`apps/mobile/src/break/Scene.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { MobileAnimation } from '../reminders/defaults';

const box = '0 0 120 120';
const fill = StyleSheet.absoluteFill;
const ink = { stroke: '#171717', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
const BOTTLE = 'M51,24 h18 q0,5 7,9 q9,6 9,17 v48 q0,9 -9,9 h-32 q-9,0 -9,-9 v-48 q0,-11 9,-17 q7,-4 7,-9 z';

function useLoop(ms: number): SharedValue<number> {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const ease = { duration: ms, easing: Easing.inOut(Easing.sin) };
    v.value = withRepeat(withSequence(withTiming(1, ease), withTiming(0, ease)), -1);
  }, [reduced, ms, v]);
  return v;
}

function Layer({ style, children }: { style?: object; children: ReactNode }) {
  return (
    <Animated.View style={[fill, style]}>
      <Svg width="100%" height="100%" viewBox={box}>{children}</Svg>
    </Animated.View>
  );
}

const steam = (xs: number[], y: number) => xs.map((x) => <Path key={x} d={`M${x},${y} q-5,-6 0,-12 t0,-12`} {...ink} />);

function Water({ u }: { u: number }) {
  const tilt = useLoop(1800);
  const rise = useLoop(2200);
  const bottle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-4 + 8 * tilt.value}deg` }] }));
  const bubbles = useAnimatedStyle(() => ({ transform: [{ translateY: -24 * u * rise.value }], opacity: 1 - 0.8 * rise.value }));
  return (
    <Animated.View style={[fill, bottle]}>
      <Layer>
        <Defs><ClipPath id="bottle"><Path d={BOTTLE} /></ClipPath></Defs>
        <G clipPath="url(#bottle)">
          <Rect x="20" y="52" width="90" height="70" fill="#CFE6FB" />
          <Path d="M20,52 q6,-4 12,0 t12,0 t12,0 t12,0 t12,0 t12,0 t12,0" fill="#CFE6FB" stroke="#8EC3EE" strokeWidth={2} />
        </G>
        <Path d={BOTTLE} {...ink} />
        <Rect x="49" y="13" width="22" height="10" rx="3" fill="#171717" />
      </Layer>
      <Layer style={bubbles}>
        <Circle cx="52" cy="98" r="2.6" fill="#fff" /><Circle cx="64" cy="102" r="2" fill="#fff" /><Circle cx="58" cy="100" r="3" fill="#fff" />
      </Layer>
    </Animated.View>
  );
}

function Meal({ u }: { u: number }) {
  const puff = useLoop(1400);
  const chop = useLoop(900);
  const steamStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * u * puff.value }], opacity: 0.35 + 0.65 * (1 - puff.value) }));
  const chopStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-8 + 16 * chop.value}deg` }] }));
  return (
    <>
      <Layer style={steamStyle}>{steam([44, 60, 76], 48)}</Layer>
      <Layer>
        <Path d="M16,62 h88 q-4,36 -44,36 q-40,0 -44,-36 z" fill="#F9DDB9" />
        <Path d="M30,62 q5,-7 10,0 t10,0 t10,0 t10,0 t10,0 t10,0" {...ink} stroke="#E0A458" />
        <Path d="M16,62 h88 q-4,36 -44,36 q-40,0 -44,-36 z" {...ink} /><Path d="M42,98 h36" {...ink} />
      </Layer>
      <Layer style={[chopStyle, { transformOrigin: '60% 37%' }]}>
        <Path d="M84,26 L54,60" {...ink} strokeWidth={4} /><Path d="M92,30 L60,62" {...ink} strokeWidth={4} />
      </Layer>
    </>
  );
}

function Tea({ u }: { u: number }) {
  const puff = useLoop(1500);
  const dip = useLoop(1100);
  const steamStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * u * puff.value }], opacity: 0.35 + 0.65 * (1 - puff.value) }));
  const bagStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 5 * u * dip.value }] }));
  return (
    <>
      <Layer style={steamStyle}>{steam([46, 58], 42)}</Layer>
      <Layer style={bagStyle}>
        <Path d="M62,50 L70,26" {...ink} strokeWidth={2} />
        <Rect x="65" y="16" width="12" height="11" rx="2" fill="#F4C6C8" stroke="#171717" strokeWidth={2.4} />
      </Layer>
      <Layer>
        <Ellipse cx="56" cy="98" rx="40" ry="6" fill="#E9E3DD" /><Path d="M18,98 q38,10 76,0" {...ink} />
        <Path d="M28,52 h56 v16 q0,24 -28,24 q-28,0 -28,-24 z" fill="#BFEBD3" />
        <Path d="M28,52 h56 v16 q0,24 -28,24 q-28,0 -28,-24 z" {...ink} />
        <Path d="M84,58 q14,0 14,11 q0,11 -14,11" {...ink} />
      </Layer>
    </>
  );
}

function Dinner({ u }: { u: number }) {
  const puff = useLoop(1500);
  const wave = useLoop(800);
  const steamStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * u * puff.value }], opacity: 0.35 + 0.65 * (1 - puff.value) }));
  const forkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * u * wave.value }] }));
  const knifeStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 3 * u * wave.value }] }));
  return (
    <>
      <Layer style={steamStyle}>{steam([52, 66], 52)}</Layer>
      <Layer>
        <Ellipse cx="60" cy="78" rx="40" ry="14" fill="#E9E3DD" /><Ellipse cx="60" cy="78" rx="40" ry="14" {...ink} />
        <Ellipse cx="60" cy="76" rx="22" ry="7" fill="#F4C6C8" /><Path d="M50,74 q10,-6 20,0" {...ink} stroke="#D98C90" />
      </Layer>
      <Layer style={forkStyle}><Path d="M10,58 v34" {...ink} /><Path d="M5,58 v10 q5,7 10,0 v-10" {...ink} /></Layer>
      <Layer style={knifeStyle}><Path d="M110,58 v34" {...ink} /><Path d="M110,58 q-8,7 0,18 z" fill="#171717" /></Layer>
    </>
  );
}

function Stretch({ u }: { u: number }) {
  const reach = useLoop(1200);
  const left = useAnimatedStyle(() => ({ transform: [{ rotate: `${45 * reach.value}deg` }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ rotate: `${-45 * reach.value}deg` }] }));
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * u * reach.value }] }));
  const shoulder = { transformOrigin: '50% 38.3%' };
  return (
    <>
      <Layer><Path d="M30,102 h60" {...ink} stroke="#BFEBD3" strokeWidth={5} /><Path d="M60,72 l-12,28 M60,72 l12,28" {...ink} /></Layer>
      <Animated.View style={[fill, body]}>
        <Layer><Circle cx="60" cy="30" r="8" fill="#F9DDB9" {...ink} /><Path d="M60,38 v34" {...ink} /></Layer>
        <Layer style={[left, shoulder]}><Path d="M60,46 l-20,-14" {...ink} /></Layer>
        <Layer style={[right, shoulder]}><Path d="M60,46 l20,-14" {...ink} /></Layer>
      </Animated.View>
    </>
  );
}

const SCENES: Record<MobileAnimation, (p: { u: number }) => ReactNode> = { water: Water, meal: Meal, tea: Tea, dinner: Dinner, stretch: Stretch };

export function Scene({ kind, size }: { kind: MobileAnimation; size: number }) {
  const Draw = SCENES[kind];
  return <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Draw u={size / 120} /></View>;
}
```

- [ ] **Step 6: The break route**

`apps/mobile/app/break.tsx`:

```tsx
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { formatClock, ringOffset, secondsLeft } from '../src/break/countdown';
import { Scene } from '../src/break/Scene';
import { getDb } from '../src/db/expoDb';
import { SNOOZE_MS } from '../src/reminders/actions';
import { ANIM_LOOK, sceneKind } from '../src/reminders/defaults';
import { expoNotifier } from '../src/reminders/expoNotifier';
import { reminderContent } from '../src/reminders/notifier';
import { getReminder, logWater, markDone } from '../src/reminders/store';
import { C, F } from '../src/theme';

const R = 140;
const CIRC = 2 * Math.PI * R;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function Break() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reminder = useMemo(() => getReminder(getDb(), Number(id)), [id]);
  const total = reminder?.breakSec || 60;
  const [start] = useState(() => Date.now());
  const [left, setLeft] = useState(total);

  useEffect(() => {
    const t = setInterval(() => setLeft(secondsLeft(start, total, Date.now())), 500);
    return () => clearInterval(t);
  }, [start, total]);

  if (!reminder) {
    return (
      <View style={[s.root, { backgroundColor: C.bg, paddingTop: insets.top + 40 }]}>
        <Text style={s.title}>This reminder is gone</Text>
        <Pressable onPress={leave} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>Back</Text></Pressable>
      </View>
    );
  }

  const kind = sceneKind(reminder.animation);
  const look = ANIM_LOOK[kind];
  const isWater = reminder.builtin === 'water';

  const finish = () => {
    const db = getDb();
    if (isWater) logWater(db, Date.now());
    markDone(db, reminder.id, Date.now());
    leave();
  };
  const snooze = () => {
    expoNotifier.scheduleAt(`snooze-${reminder.id}`, reminderContent(reminder), Date.now() + SNOOZE_MS)
      .catch((e) => console.warn('daily: snooze failed', e))
      .finally(leave);
  };

  return (
    <View style={[s.root, { backgroundColor: look.color, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <Text style={s.kicker}>{look.label} break</Text>
      <View style={s.stage}>
        <Svg width={300} height={300} viewBox="0 0 300 300" style={StyleSheet.absoluteFill}>
          <Circle cx="150" cy="150" r={R} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={6} />
          <Circle cx="150" cy="150" r={R} fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={ringOffset(left, total, CIRC)} transform="rotate(-90 150 150)" />
        </Svg>
        <Scene kind={kind} size={200} />
      </View>
      <Text style={s.clock} accessibilityLabel={`${Math.ceil(left / 60)} minutes left`}>{formatClock(left)}</Text>
      <Text style={s.title}>{left === 0 ? 'Nice. Back to it' : look.breakTitle}</Text>
      <Text style={s.body}>{reminder.message}</Text>
      <View style={s.actions}>
        <Pressable onPress={finish} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{isWater ? 'I had some' : 'I’m back'}</Text></Pressable>
        <Pressable onPress={snooze} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>Snooze 15 min</Text></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', paddingHorizontal: 28 },
  kicker: { fontFamily: F.semi, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(0,0,0,0.6)' },
  stage: { width: 300, height: 300, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  clock: { fontFamily: F.semi, fontSize: 48, letterSpacing: -1.4, color: C.ink, marginTop: 8, fontVariant: ['tabular-nums'] },
  title: { fontFamily: F.medium, fontSize: 26, color: C.ink, marginTop: 6, textAlign: 'center' },
  body: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: 'rgba(0,0,0,0.7)', textAlign: 'center', marginTop: 6 },
  actions: { marginTop: 'auto', alignSelf: 'stretch', gap: 8 },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  secondary: { minHeight: 48, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: F.medium, fontSize: 14, color: C.ink }
});
```

- [ ] **Step 7: Typecheck, tests, phone check**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`. Build to the phone; open `daily://break?id=<id>` for water, lunch, tea and dinner (`adb -s R85H8TTGGULF75UW shell am start -a android.intent.action.VIEW -d "daily://break?id=1" com.aaronalex.daily`; ids are 1–4 for the seeded built-ins). Expected: each scene animates on its colour, the ring empties, the clock counts down; "I had some" / "I'm back" returns; "Snooze 15 min" returns and `dumpsys alarm` shows a new Daily alarm. Screenshot each.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/break apps/mobile/app/break.tsx
git commit -m "feat(mobile): full-screen breaks with animated scenes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Reminders tab and editor

**Files:**
- Create: `apps/mobile/app/(tabs)/reminders.tsx` (replaces any placeholder), `app/reminder/[id].tsx`, `src/reminders/form.ts`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`, `src/ui/icons.tsx`
- Test: `apps/mobile/src/reminders/form.test.ts`

**Interfaces:**
- Consumes: store functions, `nextUp`, `phoneMsSince`, `applyReminders`, `reminderSummary`, `clock12`, `ANIM_LOOK`, `sceneKind`, `MOBILE_ANIMATIONS`, `LIMITS`, `DailyNative.canScheduleExactAlarms/openExactAlarmSettings`, `Notifications.getPermissionsAsync/requestPermissionsAsync`, `rise`, `Icon`, `C`, `F`, `formatDuration`.
- Produces:
  - `type Form = { name: string; message: string; animation: MobileAnimation; type: 'time' | 'interval'; time: string; days: number[]; minutes: number; breakSec: number }`
  - `formFrom(r: Reminder | null): Form`, `toInput(f: Form, id?: number): ReminderInput`, `stepTime(hhmm: string, deltaMin: number): string`, `toggleDay(days: number[], d: number): number[]`, `stepMinutes(min: number, delta: number): number`, `BREAK_CHOICES: number[]`, `breakLabel(sec: number): string`
  - Icon names `drop`, `meal`, `cup`, `moon`, `person`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/reminders/form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateReminder, type Reminder } from '@worksight/core/reminders';
import { breakLabel, BREAK_CHOICES, formFrom, stepMinutes, stepTime, toggleDay, toInput } from './form';

describe('reminder form', () => {
  it('starts a new reminder as a valid-once-named phone-time nudge', () => {
    const f = formFrom(null);
    expect(f).toEqual({ name: '', message: '', animation: 'stretch', type: 'interval', time: '10:00', days: [1, 2, 3, 4, 5], minutes: 45, breakSec: 0 });
    expect(validateReminder(toInput({ ...f, name: 'Stretch' }))).toBeNull();
  });

  it('round-trips an existing reminder', () => {
    const r: Reminder = { id: 3, builtin: 'tea', name: 'Tea break', message: 'Kettle', animation: 'tea', schedule: { type: 'time', time: '16:00', days: [1, 2, 3, 4, 5] }, breakSec: 300, enabled: true };
    const f = formFrom(r);
    expect(f.type).toBe('time');
    expect(toInput(f, 3)).toEqual({ id: 3, name: 'Tea break', message: 'Kettle', animation: 'tea', schedule: { type: 'time', time: '16:00', days: [1, 2, 3, 4, 5] }, breakSec: 300 });
  });

  it('steps time around midnight and keeps days sorted', () => {
    expect(stepTime('23:45', 15)).toBe('00:00');
    expect(stepTime('00:00', -15)).toBe('23:45');
    expect(stepTime('13:10', 15)).toBe('13:25');
    expect(toggleDay([1, 3], 2)).toEqual([1, 2, 3]);
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('keeps the interval within 15–240 minutes', () => {
    expect(stepMinutes(15, -15)).toBe(15);
    expect(stepMinutes(240, 15)).toBe(240);
    expect(stepMinutes(45, 15)).toBe(60);
  });

  it('labels break lengths', () => {
    expect(BREAK_CHOICES.map(breakLabel)).toEqual(['No break', '30 s', '1 min', '5 min', '15 min', '30 min']);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — `./form` missing.

- [ ] **Step 3: Implement the form helpers**

`apps/mobile/src/reminders/form.ts`:

```ts
import { LIMITS, type Reminder, type ReminderInput } from '@worksight/core/reminders';
import { sceneKind, type MobileAnimation } from './defaults';

export type Form = { name: string; message: string; animation: MobileAnimation; type: 'time' | 'interval'; time: string; days: number[]; minutes: number; breakSec: number };

export const BREAK_CHOICES = [0, 30, 60, 300, 900, 1800];

export function breakLabel(sec: number): string {
  if (sec === 0) return 'No break';
  return sec < 60 ? `${sec} s` : `${sec / 60} min`;
}

export function formFrom(r: Reminder | null): Form {
  if (!r) return { name: '', message: '', animation: 'stretch', type: 'interval', time: '10:00', days: [1, 2, 3, 4, 5], minutes: 45, breakSec: 0 };
  return {
    name: r.name, message: r.message, animation: sceneKind(r.animation), type: r.schedule.type,
    time: r.schedule.type === 'time' ? r.schedule.time : '10:00',
    days: r.schedule.type === 'time' ? [...r.schedule.days] : [1, 2, 3, 4, 5],
    minutes: r.schedule.type === 'interval' ? r.schedule.minutes : 45,
    breakSec: r.breakSec
  };
}

export function toInput(f: Form, id?: number): ReminderInput {
  return {
    ...(id ? { id } : {}),
    name: f.name, message: f.message, animation: f.animation,
    schedule: f.type === 'time' ? { type: 'time', time: f.time, days: f.days } : { type: 'interval', minutes: f.minutes },
    breakSec: f.breakSec
  };
}

export function stepTime(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + deltaMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function toggleDay(days: number[], d: number): number[] {
  return (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]).sort((a, b) => a - b);
}

export function stepMinutes(min: number, delta: number): number {
  return Math.min(LIMITS.intervalMax, Math.max(LIMITS.intervalMin, min + delta));
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @worksight/mobile test`
Expected: pass.

- [ ] **Step 5: Icons and the tab**

In `apps/mobile/src/ui/icons.tsx` `PATHS`, add:

```ts
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  meal: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 0-4 2-4 7h4',
  cup: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  person: 'M12 2.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M5 9l7 1 7-1M12 10v5l-3 6M12 15l3 6',
```

In `apps/mobile/app/(tabs)/_layout.tsx`, add after the Today screen:

```tsx
      <Tabs.Screen name="reminders" options={{ title: 'Reminders' }} />
```

- [ ] **Step 6: The Reminders tab**

`apps/mobile/app/(tabs)/reminders.tsx`:

```tsx
import type { Reminder } from '@worksight/core/reminders';
import { clock12, reminderSummary } from '@worksight/core/reminders';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DailyNative from '../../modules/daily-native';
import { getDb } from '../../src/db/expoDb';
import { formatDuration } from '../../src/format';
import { applyReminders } from '../../src/reminders/apply';
import { ANIM_LOOK, sceneKind } from '../../src/reminders/defaults';
import { nextUp, type NextUp } from '../../src/reminders/plan';
import { getStates, listReminders, setEnabled, skipToday } from '../../src/reminders/store';
import { C, F } from '../../src/theme';
import { phoneMsSince } from '../../src/tracking/sync';
import { Icon } from '../../src/ui/icons';
import { rise } from '../../src/ui/motion';

type ViewModel = { reminders: Reminder[]; next: NextUp | null; notifications: boolean; exact: boolean };

function load(): ViewModel {
  const db = getDb();
  const now = Date.now();
  const reminders = listReminders(db);
  const next = nextUp(reminders, getStates(db), now, (from) => phoneMsSince(db, from, now));
  return { reminders, next, notifications: true, exact: DailyNative.canScheduleExactAlarms() };
}

function nextLine(n: NextUp): { title: string; sub: string } {
  if (n.kind === 'clock') {
    const mins = Math.max(0, Math.round((n.atMs - Date.now()) / 60_000));
    const t = new Date(n.atMs);
    const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    return { title: `${n.reminder.name} at ${clock12(hhmm)}`, sub: mins < 24 * 60 ? `in ${formatDuration(mins)}` : 'later this week' };
  }
  return { title: n.reminder.name, sub: n.leftMin === 0 ? 'due now' : `after ${formatDuration(n.leftMin)} more phone time` };
}

export default function RemindersTab() {
  const insets = useSafeAreaInsets();
  const [vm, setVm] = useState<ViewModel | null>(null);

  const refresh = useCallback(async () => {
    try {
      const base = load();
      const perm = await Notifications.getPermissionsAsync();
      setVm({ ...base, notifications: perm.granted });
    } catch (e) { console.warn('daily: loading reminders failed', e); }
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (!vm) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const toggle = async (r: Reminder, on: boolean) => { setEnabled(getDb(), r.id, on); await applyReminders(); refresh(); };
  const skip = async (r: Reminder) => { skipToday(getDb(), r.id, Date.now()); await applyReminders(); refresh(); };
  const builtins = vm.reminders.filter((r) => r.builtin);
  const mine = vm.reminders.filter((r) => !r.builtin);
  const clockOn = vm.reminders.some((r) => r.enabled && r.schedule.type === 'time');
  const next = vm.next ? nextLine(vm.next) : null;

  const row = (r: Reminder, i: number) => {
    const look = ANIM_LOOK[sceneKind(r.animation)];
    return (
      <Animated.View key={r.id} entering={rise(3 + i)} style={s.row}>
        <Pressable onPress={() => router.push({ pathname: '/reminder/[id]', params: { id: String(r.id) } })} accessibilityRole="button" accessibilityLabel={`Edit ${r.name}`} style={s.rowMain}>
          <View style={[s.rowIco, { backgroundColor: look.color }]}><Icon name={look.icon} size={18} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{r.name}</Text>
            <Text style={s.rowSub}>{reminderSummary(r)}{r.breakSec ? ` · ${Math.round(r.breakSec / 60) || 1}-min break` : ' · just a nudge'}</Text>
          </View>
        </Pressable>
        <Switch value={r.enabled} onValueChange={(on) => toggle(r, on)} accessibilityLabel={`${r.name} ${r.enabled ? 'on' : 'off'}`}
          trackColor={{ false: C.line, true: C.ink }} thumbColor={C.white} />
      </Animated.View>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 24, gap: 10 }}>
      <Animated.View entering={rise(0)} style={s.head}>
        <Text style={s.h1}>Reminders</Text>
        <Pressable onPress={() => router.push({ pathname: '/reminder/[id]', params: { id: 'new' } })} accessibilityRole="button" style={s.newBtn}>
          <Icon name="plus" size={15} color={C.white} /><Text style={s.newText}>New</Text>
        </Pressable>
      </Animated.View>

      {!vm.notifications && (
        <Animated.View entering={rise(1)} style={s.card}>
          <Text style={s.cardTitle}>Notifications are off</Text>
          <Text style={s.cardBody}>Daily can’t remind you until you allow notifications.</Text>
          <Pressable onPress={async () => { await Notifications.requestPermissionsAsync(); refresh(); }} accessibilityRole="button" style={s.cardBtn}><Text style={s.cardBtnText}>Allow notifications</Text></Pressable>
        </Animated.View>
      )}
      {vm.notifications && clockOn && !vm.exact && (
        <Animated.View entering={rise(1)} style={s.card}>
          <Text style={s.cardTitle}>Allow exact timing</Text>
          <Text style={s.cardBody}>Without it, lunch and tea may arrive a few minutes late.</Text>
          <Pressable onPress={() => DailyNative.openExactAlarmSettings()} accessibilityRole="button" style={s.cardBtn}><Text style={s.cardBtnText}>Open settings</Text></Pressable>
        </Animated.View>
      )}

      {next && vm.next && (
        <Animated.View entering={rise(2)} style={s.next}>
          <View style={{ flex: 1 }}>
            <Text style={s.nextKicker}>Next up</Text>
            <Text style={s.nextTitle}>{next.title}</Text>
            <Text style={s.nextKicker}>{next.sub}</Text>
          </View>
          {vm.next.kind === 'clock' && (
            <Pressable onPress={() => skip(vm.next!.reminder)} accessibilityRole="button" style={s.skip}><Text style={s.skipText}>Skip today</Text></Pressable>
          )}
        </Animated.View>
      )}

      <Text style={s.label}>Daily</Text>
      {builtins.map(row)}
      {mine.length > 0 && <Text style={s.label}>Yours</Text>}
      {mine.map((r, i) => row(r, builtins.length + i))}

      <View style={s.info}>
        <Text style={s.infoText}>Water counts phone time, so it waits while you’re away. Clock reminders follow your phone’s time zone.</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', height: 44 },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  newBtn: { marginLeft: 'auto', minHeight: 44, borderRadius: 999, backgroundColor: C.ink, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  newText: { fontFamily: F.semi, fontSize: 13, color: C.white },
  card: { backgroundColor: C.white, borderRadius: 20, padding: 16, gap: 8 },
  cardTitle: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  cardBody: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.body },
  cardBtn: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.ink, justifyContent: 'center' },
  cardBtnText: { fontFamily: F.semi, fontSize: 13, color: C.white },
  next: { backgroundColor: '#F9DDB9', borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextKicker: { fontFamily: F.regular, fontSize: 12, color: 'rgba(0,0,0,0.62)' },
  nextTitle: { fontFamily: F.semi, fontSize: 20, color: C.ink, marginVertical: 2 },
  skip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center' },
  skipText: { fontFamily: F.semi, fontSize: 13, color: C.ink },
  label: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 6, marginLeft: 2 },
  row: { backgroundColor: C.white, borderRadius: 20, paddingRight: 14, minHeight: 68, flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 68 },
  rowIco: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  rowSub: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 2 },
  info: { backgroundColor: C.panel, borderRadius: 20, padding: 16, marginTop: 4 },
  infoText: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.body }
});
```

- [ ] **Step 7: The editor**

`apps/mobile/app/reminder/[id].tsx`:

```tsx
import { clock12 } from '@worksight/core/reminders';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDb } from '../../src/db/expoDb';
import { applyReminders } from '../../src/reminders/apply';
import { ANIM_LOOK, MOBILE_ANIMATIONS } from '../../src/reminders/defaults';
import { BREAK_CHOICES, breakLabel, formFrom, stepMinutes, stepTime, toggleDay, toInput, type Form } from '../../src/reminders/form';
import { deleteReminder, getReminder, saveReminder } from '../../src/reminders/store';
import { C, F } from '../../src/theme';
import { Icon } from '../../src/ui/icons';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ReminderEditor() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = id === 'new' ? null : getReminder(getDb(), Number(id));
  const [f, setF] = useState<Form>(() => formFrom(existing));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => setF((cur) => ({ ...cur, ...patch }));

  const save = async () => {
    const result = saveReminder(getDb(), toInput(f, existing?.id));
    if (!result.ok) { setError(result.error); return; }
    await applyReminders();
    router.back();
  };
  const remove = () => Alert.alert('Delete this reminder?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { deleteReminder(getDb(), existing!.id); await applyReminders(); router.back(); } }
  ]);

  const chip = (on: boolean) => [s.chip, on && { backgroundColor: C.ink }];
  const chipText = (on: boolean) => [s.chipText, on && { color: C.white }];

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={s.head}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={s.round}><Icon name="back" size={18} /></Pressable>
        <Text style={s.h1}>{existing ? 'Edit reminder' : 'New reminder'}</Text>
      </View>

      <Text style={s.label} nativeID="nameLabel">Name</Text>
      <TextInput value={f.name} onChangeText={(name) => set({ name })} maxLength={40} placeholder="Stretch" accessibilityLabelledBy="nameLabel" style={s.input} />
      <Text style={s.label} nativeID="msgLabel">Message</Text>
      <TextInput value={f.message} onChangeText={(message) => set({ message })} maxLength={120} placeholder="Stand up and reach for the sky" accessibilityLabelledBy="msgLabel" style={s.input} />

      <Text style={s.label}>Picture</Text>
      <View style={s.wrap}>
        {MOBILE_ANIMATIONS.map((a) => (
          <Pressable key={a} onPress={() => set({ animation: a })} accessibilityRole="radio" accessibilityState={{ checked: f.animation === a }} style={chip(f.animation === a)}>
            <Text style={chipText(f.animation === a)}>{ANIM_LOOK[a].label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>When</Text>
      <View style={s.wrap}>
        <Pressable onPress={() => set({ type: 'time' })} accessibilityRole="radio" accessibilityState={{ checked: f.type === 'time' }} style={chip(f.type === 'time')}><Text style={chipText(f.type === 'time')}>At a time</Text></Pressable>
        <Pressable onPress={() => set({ type: 'interval' })} accessibilityRole="radio" accessibilityState={{ checked: f.type === 'interval' }} style={chip(f.type === 'interval')}><Text style={chipText(f.type === 'interval')}>Every … of phone time</Text></Pressable>
      </View>

      {f.type === 'time' ? (
        <>
          <View style={s.stepper}>
            <Pressable onPress={() => set({ time: stepTime(f.time, -15) })} accessibilityRole="button" accessibilityLabel="15 minutes earlier" style={s.round}><Icon name="minus" /></Pressable>
            <Text style={s.big} accessibilityLiveRegion="polite">{clock12(f.time)}</Text>
            <Pressable onPress={() => set({ time: stepTime(f.time, 15) })} accessibilityRole="button" accessibilityLabel="15 minutes later" style={s.round}><Icon name="plus" /></Pressable>
          </View>
          <View style={s.wrap}>
            {DAY_LETTERS.map((d, i) => {
              const on = f.days.includes(i + 1);
              return (
                <Pressable key={i} onPress={() => set({ days: toggleDay(f.days, i + 1) })} accessibilityRole="checkbox" accessibilityLabel={DAY_NAMES[i]} accessibilityState={{ checked: on }} style={[s.day, on && { backgroundColor: C.ink }]}>
                  <Text style={chipText(on)}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <View style={s.stepper}>
          <Pressable onPress={() => set({ minutes: stepMinutes(f.minutes, -15) })} accessibilityRole="button" accessibilityLabel="Less" style={s.round}><Icon name="minus" /></Pressable>
          <Text style={s.big} accessibilityLiveRegion="polite">{f.minutes} min</Text>
          <Pressable onPress={() => set({ minutes: stepMinutes(f.minutes, 15) })} accessibilityRole="button" accessibilityLabel="More" style={s.round}><Icon name="plus" /></Pressable>
        </View>
      )}

      <Text style={s.label}>Break</Text>
      <View style={s.wrap}>
        {BREAK_CHOICES.map((b) => (
          <Pressable key={b} onPress={() => set({ breakSec: b })} accessibilityRole="radio" accessibilityState={{ checked: f.breakSec === b }} style={chip(f.breakSec === b)}>
            <Text style={chipText(f.breakSec === b)}>{breakLabel(b)}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={s.error} accessibilityLiveRegion="assertive">{error}</Text>}
      <Pressable onPress={save} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>Save</Text></Pressable>
      {existing && !existing.builtin && (
        <Pressable onPress={remove} accessibilityRole="button" style={s.secondary}><Text style={[s.primaryText, { color: C.danger }]}>Delete</Text></Pressable>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginBottom: -6, marginLeft: 2 },
  input: { backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 16, minHeight: 48, fontFamily: F.regular, fontSize: 15, color: C.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.white, justifyContent: 'center' },
  chipText: { fontFamily: F.medium, fontSize: 13, color: C.ink },
  day: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 18, alignSelf: 'center' },
  big: { fontFamily: F.semi, fontSize: 28, color: C.ink, minWidth: 130, textAlign: 'center' },
  error: { fontFamily: F.medium, fontSize: 13, color: C.danger },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }
});
```

- [ ] **Step 8: Typecheck, tests, phone check**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`. On the phone: Reminders tab shows Next up, the four built-ins (Dinner off), switches work; "Skip today" moves Next up to tomorrow; New → name "Stretch", every 30 min, no break → Save → it appears under "Yours"; edit Tea to 5 minutes from now → a notification arrives at that time with "Take a break / Snooze 15 min" (lock the phone for the check). Delete the custom one. Screenshot the tab and the editor.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/app apps/mobile/src/reminders/form.ts apps/mobile/src/reminders/form.test.ts apps/mobile/src/ui/icons.tsx
git commit -m "feat(mobile): Reminders tab and reminder editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Onboarding step 4 — reminders and notification permission

**Files:**
- Modify: `apps/mobile/app/onboarding.tsx`

**Interfaces:**
- Consumes: `applyReminders`, `Notifications.requestPermissionsAsync`, `Icon` (`drop`, `cup`, `bell`).
- Produces: `STEPS = 4`; the goal step's button becomes "Next"; step 4 "Reminders that look after you" with "Turn on reminders" (asks permission, then finishes) and "Not now" (finishes). `finish()` also calls `applyReminders()`.

- [ ] **Step 1: Edit the screen**

In `apps/mobile/app/onboarding.tsx`:
- `const STEPS = 4;`
- add `import * as Notifications from 'expo-notifications';` and `import { applyReminders } from '../src/reminders/apply';`
- make `finish` async and plan reminders before leaving:

```tsx
  const finish = async () => {
    const db = getDb();
    setSetting(db, 'goal_min', goal);
    setSetting(db, 'onboarded', '1');
    await applyReminders();
    router.replace('/');
  };
```

- add the step body after step 2's block:

```tsx
        {step === 3 && (
          <View style={s.body}>
            <View style={[s.hero, { backgroundColor: '#CFE6FB' }]}><Sunny face="happy" size={120} /></View>
            <Text style={s.h1}>Reminders that look after you</Text>
            <Text style={s.p}>Daily nudges you when it’s time for a break. You can change or turn off any of them.</Text>
            <View style={s.point}><View style={s.pointIco}><Icon name="drop" size={15} /></View><Text style={s.pointText}>Water after every hour of phone time.</Text></View>
            <View style={s.point}><View style={s.pointIco}><Icon name="cup" size={15} /></View><Text style={s.pointText}>Lunch at 1 pm and tea at 4 pm on weekdays.</Text></View>
          </View>
        )}
```

- replace the bottom buttons for steps 2 and 3:

```tsx
        {step === 2 && <Primary label="Next" onPress={() => setStep(3)} />}
        {step === 3 && (
          <>
            <Primary label="Turn on reminders" onPress={async () => { await Notifications.requestPermissionsAsync().catch(() => null); await finish(); }} />
            <Pressable onPress={finish} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>Not now</Text></Pressable>
          </>
        )}
```

and add `accessibilityRole="button"` to the `Primary` component's `Pressable` and to the existing "Not now, just reminders" `Pressable` (M1 follow-up).

- [ ] **Step 2: Typecheck and phone check**

Run: `pnpm --filter @worksight/mobile typecheck`. On the phone reset Daily (`run-as com.aaronalex.daily rm -rf files/SQLite`), walk all 4 steps; on step 4 tap "Turn on reminders" (Android 12 shows no dialog — notifications are on by default) → Today. `dumpsys alarm | findstr com.aaronalex.daily` shows lunch/tea alarms right after onboarding. Screenshot step 4.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/onboarding.tsx
git commit -m "feat(mobile): onboarding asks to turn on reminders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: M1 follow-ups

**Files:**
- Modify: `apps/mobile/app/settings/index.tsx`, `app/dev/sunny.tsx`, `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `RETENTION_CHOICES`, `Redirect`.
- Produces: no new interfaces.

- [ ] **Step 1: Confirm before shortening history** (M1 final review #8)

In `apps/mobile/app/settings/index.tsx`, replace `cycleRetention` with:

```tsx
  const cycleRetention = () => {
    const next = RETENTION_CHOICES[(RETENTION_CHOICES.indexOf(retention as (typeof RETENTION_CHOICES)[number]) + 1) % RETENTION_CHOICES.length];
    const apply = () => { setRetention(next); setSetting(db, 'retention_days', next); };
    if (next >= retention) { apply(); return; }
    Alert.alert(`Keep only ${next} days?`, `History older than ${next} days will be deleted the next time Daily updates.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Keep ${next} days`, style: 'destructive', onPress: apply }
    ]);
  };
```

Add `accessibilityRole="button"` to every `Pressable` in this file that lacks one (back button, rows).

- [ ] **Step 2: Dev gallery only in development** (M1 review)

In `apps/mobile/app/dev/sunny.tsx`, at the top of the component:

```tsx
  if (!__DEV__) return <Redirect href="/" />;
```

(import `Redirect` from `expo-router`).

- [ ] **Step 3: Today accessibility labels** (M1 review)

In `apps/mobile/app/(tabs)/index.tsx`: add `accessibilityRole="button"` to the Settings gear `Pressable` and to the banner's button; set the banner button's `accessibilityLabel="Open usage access settings"`.

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`
Expected: clean.

```bash
git add apps/mobile/app
git commit -m "fix(mobile): confirm shorter history, dev-only gallery, button roles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Phase check

**Files:**
- Create: `docs/superpowers/plans/2026-10-07-daily-m2-checklist.md`

- [ ] **Step 1: Full test run**

Run: `pnpm test` (all workspaces — the reminder types moved into core and the desktop re-exports them), `pnpm --filter @worksight/web build`, and from `apps/consumer` `npx electron-vite build`. If a desktop suite fails only on `better_sqlite3` ABI, run `pnpm --filter @worksight/consumer pretest` and retry. Don't kill the user's running `Daylens.exe`.
Expected: all green; report the per-workspace counts.

- [ ] **Step 2: Write the checklist**

`docs/superpowers/plans/2026-10-07-daily-m2-checklist.md`:

```markdown
# Daily M2 — phone checklist (Realme 7, Android 12)

Build: `cd apps/mobile && npx expo run:android --device RMX2151`. Reset Daily only: `adb -s R85H8TTGGULF75UW shell run-as com.aaronalex.daily rm -rf files/SQLite`.

- [ ] Onboarding has 4 steps; "Turn on reminders" lands on Today; `dumpsys alarm | findstr com.aaronalex.daily` lists lunch/tea alarms
- [ ] Reminders tab: Next up, built-ins (Dinner off), switches, Skip today, New / edit / delete a custom reminder
- [ ] Edit Tea to 2 minutes from now, lock the phone → notification with "Take a break" and "Snooze 15 min" arrives on time
- [ ] "Take a break" opens the tea break full screen; the ring empties; "I'm back" returns
- [ ] "Snooze 15 min" → the reminder comes back 15 minutes later
- [ ] Water: after an hour of phone time a water notification arrives (within 15 min with Daily closed; at the next minute with Today open); "I had some" from the shade logs it without opening Daily
- [ ] Close Daily completely, tap "I had some" on a water notification → reopening Daily shows it was counted once
- [ ] Turn notifications off for Daily in Android settings → the Reminders tab shows "Notifications are off" with a working button
- [ ] Change the phone's time zone (Settings → System → Date & time) and reopen Daily → Next up shows the same local times
- [ ] Settings → Keep history for: lowering it asks first
- [ ] Remove animations on → break scenes stand still
- [ ] TalkBack: switches read "<name> on/off", day buttons read the day name
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-10-07-daily-m2-checklist.md
git commit -m "docs: Daily M2 phone checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
