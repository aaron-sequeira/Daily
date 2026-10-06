# Daily M1 — Skeleton, Tracking, Today, Sunny Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Daily Android app in `apps/mobile` that reads the phone's app usage, stores it on the phone, and shows today's phone time, categories, timeline and Sunny's mood — with onboarding and basic settings.

**Architecture:** Expo SDK 57 app (expo-router) in the pnpm monorepo. One local Kotlin Expo module (`modules/daily-native`) exposes Android usage events and app info. Everything else is TypeScript: pure functions (ingest, categories, mood, today view) tested with Vitest over a `Db` interface that is backed by `expo-sqlite` in the app and `sql.js` in tests.

**Tech Stack:** Expo SDK 57 · React 19.2 · React Native 0.86 · expo-router · expo-sqlite · react-native-svg · react-native-reanimated 4 (+ react-native-worklets) · expo-background-task · expo-file-system · expo-sharing · @expo-google-fonts/dm-sans · Kotlin (Expo Modules API) · Vitest 2 + sql.js.

**Spec:** `docs/superpowers/specs/2026-10-06-daily-mobile-app-design.md` (this plan is phase **M1**, spec §15). Visual reference: https://claude.ai/artifact/JmPUVf1cqE17ygnhgar8Gg (boards Today, Onboarding, Settings, Sunny moods, Sun buddy, Daily logo).

## Global Constraints

- App name **Daily**; Android package **`com.aaronalex.daily`**; scheme `daily`. Android only (no iOS/web config).
- Expo **SDK 57** exactly as `create-expo-app` produces it (react `19.2.3`, react-native `0.86.3`); add Expo libraries only with `npx expo install` so versions match the SDK.
- Repo `.npmrc` stays `node-linker=hoisted` — never change install layout repo-wide (Electron native rebuilds depend on it).
- `android/` and `ios/` are generated (`expo run:android` prebuilds them) and are **not committed**. Native config lives in `app.json` and the local module's own `AndroidManifest.xml`.
- **No `QUERY_ALL_PACKAGES`.** App visibility comes from `<queries>` launcher/home intents.
- Privacy: store only package names, app labels, app icons and times. Never notification text, messages or screen content.
- Tokens: background `#FBF8F4`, panel `#F2EBE6`, ink `#171717`, muted `#77716C`, line `#E7DFD8`; Social `#F4C6C8`, Messages `#CFE6FB`, Fun `#F9DDB9`, Learning `#BFEBD3`, Work `#D8D2FC`, Other `#E9E3DD`. Font DM Sans 400/500/600.
- Motion: rise-in ~0.7 s ease `cubic-bezier(.22,.8,.26,1)`, spring presses; Reanimated layout animations use `ReduceMotion.System` (the default) so the Android "Remove animations" setting turns them off; Sunny's loops check `useReducedMotion()`.
- Sunny mood rule (spec §8): `ratio = phoneMin / goalMin` → `<0.5 glowing`, `<0.8 happy`, `<1.0 alright`, `<1.3 fading`, else `sad`. Default goal **240 min**, editable 60–720 in 30-min steps.
- Days are local calendar days in the device's current zone, split at local midnight.
- Retention default **90 days** (choices 30 / 90 / 180 / 365).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/daily-mobile`.

## Deliberate deviations from the spec (M1)

- **Buddy registry (spec §8 "Buddy seam") is deferred** until a second buddy exists. ponytail: a registry with one entry is an abstraction with one implementation; `<Sunny face size>` is the only call site type, so adding `buddies/index.ts` later touches the same few lines.
- **Kotlin JVM test for event mapping is deferred to M3**, where the module gets its mood twin and a JUnit setup anyway. The mapping is a five-line `when`, checked on the emulator in Task 6.
- **Onboarding has 3 steps in M1**; the spec's 4th (notifications + Sunny service) arrives with M2/M3.

## Review Focus

1. **The same usage events arrive twice** (foreground sync and the 15-min background task overlap, or a sync is retried) → phone time must not double. Pinned by Task 7's "re-sync returns no duplicates" test and the `running` guard in `runSync`.
2. **A session crosses midnight** (scrolling from 23:30 to 00:30) → 30 min count for each day, never 60 for one. Pinned by Task 4's midnight-split test (run in `Asia/Kolkata`, a half-hour-offset zone).
3. **Usage access is off or revoked later** → no crash, no invented numbers: Today shows the "Turn on usage access" card and Sunny's "can't see" face. Pinned by Task 7's `no_access` test and Task 10's empty-day test.
4. **An app was tracked and then uninstalled, or isn't in the `apps` table yet** → it still counts, labelled by its package name, category Other. Pinned by Task 10's unknown-app test.
5. **The user changes their goal mid-day** → Sunny's mood updates immediately (mood is computed live from phone time and the current goal, not cached). Pinned by Task 10's goal-change test.

---

## File Structure

```
apps/mobile/
├─ package.json, app.json, tsconfig.json, babel.config.js (if template has one), vitest.config.ts, vitest.setup.ts, .gitignore
├─ app/
│  ├─ _layout.tsx              fonts, DB init (fatal screen on failure), onboarding redirect, Stack
│  ├─ (tabs)/_layout.tsx       Tabs with custom TabBar (only "Today" in M1)
│  ├─ (tabs)/index.tsx         Today screen
│  ├─ onboarding.tsx           3 steps: welcome, usage access, goal
│  ├─ settings/index.tsx       goal, retention, categories link, export, delete, dev links
│  ├─ settings/categories.tsx  per-app category override
│  └─ dev/sunny.tsx            Sunny gallery (dev only)
├─ modules/daily-native/       Kotlin Expo module (usage events, app info, launcher, access)
│  ├─ expo-module.config.json, index.ts
│  └─ android/{build.gradle, src/main/AndroidManifest.xml, src/main/java/expo/modules/dailynative/DailyNativeModule.kt}
└─ src/
   ├─ smoke.test.ts
   ├─ theme.ts                 tokens, fonts, durations
   ├─ format.ts (+test)        formatDuration, hourLabel
   ├─ db/db.ts                 Db interface
   ├─ db/schema.ts (+test)     migrations
   ├─ db/settings.ts (+test)   typed settings with defaults
   ├─ db/expoDb.ts             expo-sqlite adapter + getDb()
   ├─ db/testDb.ts             sql.js adapter (tests only)
   ├─ tracking/ingest.ts (+test)      events → sessions/pickups
   ├─ tracking/categories.ts (+test)  category rules
   ├─ tracking/sync.ts (+test)        native → DB, mood log, retention sweep
   ├─ tracking/runSync.ts             app wiring + in-flight guard
   ├─ tracking/backgroundTask.ts      15-min backup task
   ├─ sunny/mood.ts (+test, mood.cases.json)
   ├─ sunny/look.ts (+test)    per-mood drawing data + rays path
   ├─ sunny/Sunny.tsx          animated buddy
   ├─ today/build.ts (+test)   pure TodayView builder
   ├─ today/copy.ts (+test)    greeting, mood + goal lines
   ├─ today/load.ts (+test)    DB → TodayView
   ├─ settings/data.ts (+test) export, delete everything, seed sample day, category override
   └─ ui/                      Logo, icons, TabBar, motion, Card, FatalScreen, GoalStepper
```

---

### Task 1: Scaffold `apps/mobile` and the test harness

**Files:**
- Create: `apps/mobile/*` (from template), `apps/mobile/vitest.config.ts`, `apps/mobile/vitest.setup.ts`, `apps/mobile/src/smoke.test.ts`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`
- Modify: `package.json` (root `test` script)
- Delete: `apps/mobile/App.tsx`, `apps/mobile/index.ts`, `apps/mobile/.git/`

**Interfaces:**
- Produces: workspace package `@worksight/mobile` with scripts `android`, `start`, `test`, `typecheck`; Vitest runs `src/**/*.test.ts` in time zone `Asia/Kolkata`.

- [ ] **Step 1: Create the app from the SDK 57 template**

```bash
cd apps
npx create-expo-app@latest mobile -t blank-typescript --no-install --no-agents-md
rm -rf mobile/.git mobile/App.tsx mobile/index.ts
cd ..
```

The template creates its own git repo — it must be removed so the app is part of this repo.

- [ ] **Step 2: Edit `apps/mobile/package.json`**

Keep the template's `dependencies`/`devDependencies` versions. Set:

```json
{
  "name": "@worksight/mobile",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
pnpm install
cd apps/mobile
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar expo-splash-screen expo-sqlite expo-font @expo-google-fonts/dm-sans react-native-svg react-native-reanimated react-native-worklets expo-background-task expo-task-manager expo-file-system expo-sharing
pnpm add @worksight/core@workspace:*
pnpm add -D vitest@^2.1.8 sql.js @types/sql.js
cd ../..
```

If `npx expo install` asks to add config plugins to `app.json`, accept.

- [ ] **Step 4: Write `apps/mobile/app.json`**

Keep any `plugins` entries `expo install` added and the template's icon asset paths. The file must contain:

```json
{
  "expo": {
    "name": "Daily",
    "slug": "daily",
    "scheme": "daily",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "backgroundColor": "#FBF8F4",
    "android": {
      "package": "com.aaronalex.daily",
      "adaptiveIcon": {
        "backgroundColor": "#171717",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "plugins": ["expo-router"],
    "experiments": { "typedRoutes": true }
  }
}
```

(Real Daily icons come in M6.) Remove the template's `ios` and `web` blocks.

- [ ] **Step 5: Make sure generated native folders are ignored**

`apps/mobile/.gitignore` must contain these lines (add them if missing):

```
/android
/ios
.expo/
```

- [ ] **Step 6: Minimal router entry**

`apps/mobile/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`apps/mobile/app/index.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF8F4' }}>
      <Text>Daily</Text>
    </View>
  );
}
```

- [ ] **Step 7: Test harness**

`apps/mobile/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], setupFiles: ['./vitest.setup.ts'] }
});
```

`apps/mobile/vitest.setup.ts`:

```ts
// A half-hour-offset zone catches day-boundary bugs that UTC would hide.
process.env.TZ = 'Asia/Kolkata';
```

- [ ] **Step 8: Write the smoke test (proves workspace import + time zone)**

`apps/mobile/src/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { localDate } from '@worksight/core/date';

describe('harness', () => {
  it('imports @worksight/core and runs in Asia/Kolkata', () => {
    // 20:00 UTC on 5 Oct is 01:30 on 6 Oct in India.
    expect(localDate(Date.UTC(2026, 9, 5, 20, 0))).toBe('2026-10-06');
  });
});
```

- [ ] **Step 9: Run it**

Run: `pnpm --filter @worksight/mobile test`
Expected: 1 passed.

- [ ] **Step 10: Add mobile to the root test script**

In root `package.json`, change `test` to:

```json
"test": "pnpm --workspace-concurrency=1 --filter @worksight/core --filter @worksight/agent --filter @worksight/consumer --filter @worksight/mobile test"
```

- [ ] **Step 11: Run on the emulator**

Start the `Pixel_9` emulator (Android Studio → Device Manager, or `"%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd Pixel_9`). Then:

Run: `pnpm --filter @worksight/mobile android`
Expected: Gradle builds (first build takes several minutes), the app installs and shows "Daily" on cream. If Metro cannot resolve `@worksight/core` later, check that `apps/mobile` has no `metro.config.js` overriding Expo's monorepo defaults.

- [ ] **Step 12: Commit**

```bash
git add apps/mobile package.json pnpm-lock.yaml
git commit -m "feat(mobile): scaffold Daily Expo app with vitest harness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database layer and settings

**Files:**
- Create: `apps/mobile/src/db/db.ts`, `src/db/schema.ts`, `src/db/settings.ts`, `src/db/expoDb.ts`, `src/db/testDb.ts`
- Test: `apps/mobile/src/db/schema.test.ts`, `apps/mobile/src/db/settings.test.ts`

**Interfaces:**
- Produces:
  - `type Param = string | number | null`
  - `interface Db { exec(sql: string): void; run(sql: string, params?: Param[]): void; all<T>(sql: string, params?: Param[]): T[]; get<T>(sql: string, params?: Param[]): T | null; tx(fn: () => void): void }`
  - `migrate(db: Db): void`, `SCHEMA_VERSION: number`
  - `getDb(): Db` (app), `makeTestDb(): Promise<Db>` (tests)
  - `DEFAULTS`, `type SettingKey`, `getSetting(db, key): string`, `getNumber(db, key): number`, `setSetting(db, key, value: string | number): void`
  - Tables: `sessions(id, package, start_ms, end_ms, day)` unique `(package, start_ms)`; `pickups(ts_ms PK, day)`; `apps(package PK, label, category, user_category, icon_png)`; `ingest_state(id=1, last_event_ms, open_pkg, open_start_ms)`; `mood_log(day, ts_ms, mood)`; `settings(key PK, value)`.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/db/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from './testDb';
import { migrate, SCHEMA_VERSION } from './schema';

describe('migrate', () => {
  it('creates every table and records the version', async () => {
    const db = await makeTestDb();
    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
    expect(tables).toEqual(['apps', 'ingest_state', 'mood_log', 'pickups', 'sessions', 'settings']);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(SCHEMA_VERSION);
  });

  it('is safe to run twice', async () => {
    const db = await makeTestDb();
    expect(() => migrate(db)).not.toThrow();
  });

  it('ignores a duplicate session for the same app and start', async () => {
    const db = await makeTestDb();
    const row = ['com.x', 1000, 2000, '2026-10-06'];
    db.run('INSERT OR IGNORE INTO sessions (package, start_ms, end_ms, day) VALUES (?,?,?,?)', row);
    db.run('INSERT OR IGNORE INTO sessions (package, start_ms, end_ms, day) VALUES (?,?,?,?)', row);
    expect(db.all('SELECT * FROM sessions')).toHaveLength(1);
  });
});
```

`apps/mobile/src/db/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from './testDb';
import { getNumber, getSetting, setSetting } from './settings';

describe('settings', () => {
  it('returns defaults when unset', async () => {
    const db = await makeTestDb();
    expect(getNumber(db, 'goal_min')).toBe(240);
    expect(getNumber(db, 'retention_days')).toBe(90);
    expect(getSetting(db, 'onboarded')).toBe('0');
  });

  it('persists a change', async () => {
    const db = await makeTestDb();
    setSetting(db, 'goal_min', 180);
    setSetting(db, 'goal_min', 210);
    expect(getNumber(db, 'goal_min')).toBe(210);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./testDb`.

- [ ] **Step 3: Implement**

`apps/mobile/src/db/db.ts`:

```ts
export type Param = string | number | null;

/** The small slice of SQLite the app uses — expo-sqlite in the app, sql.js in tests. */
export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: Param[]): void;
  all<T>(sql: string, params?: Param[]): T[];
  get<T>(sql: string, params?: Param[]): T | null;
  tx(fn: () => void): void;
}
```

`apps/mobile/src/db/schema.ts`:

```ts
import type { Db } from './db';

const MIGRATIONS: string[] = [
  `CREATE TABLE sessions (id INTEGER PRIMARY KEY, package TEXT NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, day TEXT NOT NULL);
   CREATE UNIQUE INDEX sessions_unique ON sessions(package, start_ms);
   CREATE INDEX sessions_day ON sessions(day);
   CREATE TABLE pickups (ts_ms INTEGER PRIMARY KEY, day TEXT NOT NULL);
   CREATE INDEX pickups_day ON pickups(day);
   CREATE TABLE apps (package TEXT PRIMARY KEY, label TEXT NOT NULL, category TEXT NOT NULL, user_category TEXT, icon_png TEXT);
   CREATE TABLE ingest_state (id INTEGER PRIMARY KEY CHECK (id = 1), last_event_ms INTEGER NOT NULL, open_pkg TEXT, open_start_ms INTEGER);
   CREATE TABLE mood_log (day TEXT NOT NULL, ts_ms INTEGER NOT NULL, mood TEXT NOT NULL);
   CREATE INDEX mood_log_day ON mood_log(day);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: Db): void {
  const current = db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.tx(() => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
```

`apps/mobile/src/db/settings.ts`:

```ts
import type { Db } from './db';

export const DEFAULTS = {
  goal_min: '240',
  retention_days: '90',
  onboarded: '0'
} as const;

export type SettingKey = keyof typeof DEFAULTS;

export function getSetting(db: Db, key: SettingKey): string {
  return db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? DEFAULTS[key];
}

export function getNumber(db: Db, key: SettingKey): number {
  return Number(getSetting(db, key));
}

export function setSetting(db: Db, key: SettingKey, value: string | number): void {
  db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]);
}
```

`apps/mobile/src/db/testDb.ts`:

```ts
import initSqlJs from 'sql.js';
import type { Db, Param } from './db';
import { migrate } from './schema';

/** In-memory migrated database for tests (sql.js — no native build needed). */
export async function makeTestDb(): Promise<Db> {
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  const all = <T>(sql: string, params: Param[] = []): T[] => {
    const st = raw.prepare(sql);
    st.bind(params);
    const out: T[] = [];
    while (st.step()) out.push(st.getAsObject() as T);
    st.free();
    return out;
  };
  const db: Db = {
    exec: (sql) => { raw.exec(sql); },
    run: (sql, params = []) => { raw.run(sql, params); },
    all,
    get: (sql, params = []) => all<never>(sql, params)[0] ?? null,
    tx: (fn) => {
      raw.exec('BEGIN');
      try { fn(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; }
    }
  };
  migrate(db);
  return db;
}
```

`apps/mobile/src/db/expoDb.ts`:

```ts
import * as SQLite from 'expo-sqlite';
import type { Db, Param } from './db';
import { migrate } from './schema';

export const DB_NAME = 'daily.db';
let db: Db | null = null;

/** Opens and migrates the app database once. Throws if migration fails (root layout shows the fatal screen). */
export function getDb(): Db {
  if (db) return db;
  const raw = SQLite.openDatabaseSync(DB_NAME);
  const wrapped: Db = {
    exec: (sql) => raw.execSync(sql),
    run: (sql, params: Param[] = []) => { raw.runSync(sql, params); },
    all: <T>(sql: string, params: Param[] = []) => raw.getAllSync<T>(sql, params),
    get: <T>(sql: string, params: Param[] = []) => raw.getFirstSync<T>(sql, params) ?? null,
    tx: (fn) => raw.withTransactionSync(fn)
  };
  migrate(wrapped);
  db = wrapped;
  return db;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @worksight/mobile typecheck`
Expected: no errors. (If `getAllSync`'s generic signature differs in the installed `expo-sqlite`, adapt the cast in `expoDb.ts` only — check `node_modules/expo-sqlite/build/SQLiteDatabase.d.ts`.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/db
git commit -m "feat(mobile): sqlite schema, settings and test db

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sunny's mood rule

**Files:**
- Create: `apps/mobile/src/sunny/mood.ts`, `apps/mobile/src/sunny/mood.cases.json`
- Test: `apps/mobile/src/sunny/mood.test.ts`

**Interfaces:**
- Produces: `MOODS`, `type Mood = 'glowing' | 'happy' | 'alright' | 'fading' | 'sad'`, `moodFor(phoneMin: number, goalMin: number): Mood`, `MOOD_COPY: Record<Mood, { title: string; quote: string }>`, `moodIndex(mood: Mood): number` (0–4). `mood.cases.json` is reused by the Kotlin twin in M3.

- [ ] **Step 1: Write the cases file**

`apps/mobile/src/sunny/mood.cases.json`:

```json
[
  { "min": 0, "goal": 240, "mood": "glowing" },
  { "min": 119, "goal": 240, "mood": "glowing" },
  { "min": 120, "goal": 240, "mood": "happy" },
  { "min": 191, "goal": 240, "mood": "happy" },
  { "min": 192, "goal": 240, "mood": "alright" },
  { "min": 239, "goal": 240, "mood": "alright" },
  { "min": 240, "goal": 240, "mood": "fading" },
  { "min": 311, "goal": 240, "mood": "fading" },
  { "min": 312, "goal": 240, "mood": "sad" },
  { "min": 1000, "goal": 240, "mood": "sad" },
  { "min": 29.9, "goal": 60, "mood": "glowing" },
  { "min": 30, "goal": 60, "mood": "happy" },
  { "min": 47.9, "goal": 60, "mood": "happy" },
  { "min": 48, "goal": 60, "mood": "alright" },
  { "min": 59.9, "goal": 60, "mood": "alright" },
  { "min": 60, "goal": 60, "mood": "fading" },
  { "min": 77.9, "goal": 60, "mood": "fading" },
  { "min": 78, "goal": 60, "mood": "sad" },
  { "min": 360, "goal": 720, "mood": "happy" },
  { "min": 576, "goal": 720, "mood": "alright" }
]
```

- [ ] **Step 2: Write the failing test**

`apps/mobile/src/sunny/mood.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import cases from './mood.cases.json';
import { MOOD_COPY, MOODS, moodFor, moodIndex } from './mood';

describe('moodFor', () => {
  it.each(cases)('$min of $goal min → $mood', ({ min, goal, mood }) => {
    expect(moodFor(min, goal)).toBe(mood);
  });

  it('never divides by zero', () => {
    expect(moodFor(0, 0)).toBe('glowing');
  });

  it('has copy and an index for every mood', () => {
    for (const m of MOODS) expect(MOOD_COPY[m].title.length).toBeGreaterThan(0);
    expect(MOODS.map(moodIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./mood`.

- [ ] **Step 4: Implement**

`apps/mobile/src/sunny/mood.ts`:

```ts
export const MOODS = ['glowing', 'happy', 'alright', 'fading', 'sad'] as const;
export type Mood = typeof MOODS[number];

/** Spec §8. Keep in sync with the Kotlin twin (M3) — both run mood.cases.json. */
export function moodFor(phoneMin: number, goalMin: number): Mood {
  const ratio = phoneMin / Math.max(goalMin, 1);
  if (ratio < 0.5) return 'glowing';
  if (ratio < 0.8) return 'happy';
  if (ratio < 1) return 'alright';
  if (ratio < 1.3) return 'fading';
  return 'sad';
}

export function moodIndex(mood: Mood): number {
  return MOODS.indexOf(mood);
}

export const MOOD_COPY: Record<Mood, { title: string; quote: string }> = {
  glowing: { title: 'Sunny is glowing', quote: 'Best day ever!' },
  happy: { title: 'Sunny is happy', quote: 'Feeling bright.' },
  alright: { title: "Sunny's doing alright", quote: "I'm okay… could do better." },
  fading: { title: 'Sunny is fading', quote: 'Getting a bit dim in here.' },
  sad: { title: 'Sunny is sad', quote: "I've lost my shine." }
};
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass. (If TS complains about importing JSON, add `"resolveJsonModule": true` under `compilerOptions` in `apps/mobile/tsconfig.json`.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/sunny apps/mobile/tsconfig.json
git commit -m "feat(mobile): Sunny mood rule with shared case table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ingest — usage events to sessions and pickups

**Files:**
- Create: `apps/mobile/src/tracking/ingest.ts`
- Test: `apps/mobile/src/tracking/ingest.test.ts`

**Interfaces:**
- Consumes: `localDate(ms): string` from `@worksight/core/date`.
- Produces:
  - `type RawEvent = { type: 'resumed' | 'paused' | 'screen_on' | 'screen_off' | 'unlock'; pkg: string; ts: number }`
  - `type IngestState = { lastEventMs: number; openPkg: string | null; openStartMs: number | null }`
  - `type Session = { pkg: string; startMs: number; endMs: number; day: string }`
  - `ingest(events: RawEvent[], state: IngestState, ignore: ReadonlySet<string>): { sessions: Session[]; pickups: number[]; state: IngestState }`
  - `splitAtMidnight(pkg: string, startMs: number, endMs: number): Session[]`
  - `dayStartMs(day: string): number`, `INITIAL_STATE: IngestState`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/tracking/ingest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { INITIAL_STATE, dayStartMs, ingest, splitAtMidnight, type RawEvent } from './ingest';

const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();
const none = new Set<string>();

describe('ingest', () => {
  it('pairs resume and pause into a session', () => {
    const ev: RawEvent[] = [
      { type: 'resumed', pkg: 'com.a', ts: at(9) },
      { type: 'paused', pkg: 'com.a', ts: at(9, 20) }
    ];
    const r = ingest(ev, INITIAL_STATE, none);
    expect(r.sessions).toEqual([{ pkg: 'com.a', startMs: at(9), endMs: at(9, 20), day: '2026-10-06' }]);
    expect(r.state).toEqual({ lastEventMs: at(9, 20), openPkg: null, openStartMs: null });
  });

  it('closes the current app when another resumes', () => {
    const ev: RawEvent[] = [
      { type: 'resumed', pkg: 'com.a', ts: at(9) },
      { type: 'resumed', pkg: 'com.b', ts: at(9, 5) },
      { type: 'paused', pkg: 'com.a', ts: at(9, 5) },
      { type: 'paused', pkg: 'com.b', ts: at(9, 8) }
    ];
    const r = ingest(ev, INITIAL_STATE, none);
    expect(r.sessions.map((s) => [s.pkg, s.endMs - s.startMs])).toEqual([['com.a', 5 * 60_000], ['com.b', 3 * 60_000]]);
  });

  it('closes on screen off and counts unlocks as pickups', () => {
    const ev: RawEvent[] = [
      { type: 'unlock', pkg: 'android', ts: at(8) },
      { type: 'screen_on', pkg: 'android', ts: at(8) },
      { type: 'resumed', pkg: 'com.a', ts: at(8, 1) },
      { type: 'screen_off', pkg: 'android', ts: at(8, 11) }
    ];
    const r = ingest(ev, INITIAL_STATE, none);
    expect(r.pickups).toEqual([at(8)]);
    expect(r.sessions).toHaveLength(1);
    expect(r.sessions[0].endMs).toBe(at(8, 11));
    expect(r.state.openPkg).toBeNull();
  });

  it('never records ignored apps but lets them close the previous app', () => {
    const ev: RawEvent[] = [
      { type: 'resumed', pkg: 'com.a', ts: at(9) },
      { type: 'resumed', pkg: 'launcher', ts: at(9, 4) },
      { type: 'paused', pkg: 'launcher', ts: at(9, 6) }
    ];
    const r = ingest(ev, INITIAL_STATE, new Set(['launcher']));
    expect(r.sessions.map((s) => s.pkg)).toEqual(['com.a']);
    expect(r.state.openPkg).toBeNull();
  });

  it('splits a session at local midnight (Review Focus 2)', () => {
    const ev: RawEvent[] = [
      { type: 'resumed', pkg: 'com.a', ts: at(23, 30, 6) },
      { type: 'paused', pkg: 'com.a', ts: at(0, 30, 7) }
    ];
    const r = ingest(ev, INITIAL_STATE, none);
    expect(r.sessions.map((s) => [s.day, (s.endMs - s.startMs) / 60_000])).toEqual([['2026-10-06', 30], ['2026-10-07', 30]]);
  });

  it('carries an open app across batches', () => {
    const first = ingest([{ type: 'resumed', pkg: 'com.a', ts: at(10) }], INITIAL_STATE, none);
    expect(first.sessions).toEqual([]);
    expect(first.state).toEqual({ lastEventMs: at(10), openPkg: 'com.a', openStartMs: at(10) });
    const second = ingest([{ type: 'paused', pkg: 'com.a', ts: at(10, 15) }], first.state, none);
    expect(second.sessions).toEqual([{ pkg: 'com.a', startMs: at(10), endMs: at(10, 15), day: '2026-10-06' }]);
  });

  it('skips events already processed and sorts the rest (Review Focus 1)', () => {
    const ev: RawEvent[] = [
      { type: 'paused', pkg: 'com.a', ts: at(9, 20) },
      { type: 'resumed', pkg: 'com.a', ts: at(9) }
    ];
    const once = ingest(ev, INITIAL_STATE, none);
    expect(once.sessions).toHaveLength(1);
    const again = ingest(ev, once.state, none);
    expect(again.sessions).toEqual([]);
    expect(again.pickups).toEqual([]);
  });
});

describe('splitAtMidnight / dayStartMs', () => {
  it('returns one piece inside a day', () => {
    expect(splitAtMidnight('com.a', at(9), at(10))).toHaveLength(1);
  });

  it('finds local midnight of a day key', () => {
    expect(dayStartMs('2026-10-06')).toBe(at(0, 0, 6));
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./ingest`.

- [ ] **Step 3: Implement**

`apps/mobile/src/tracking/ingest.ts`:

```ts
import { localDate } from '@worksight/core/date';

export type RawEvent = { type: 'resumed' | 'paused' | 'screen_on' | 'screen_off' | 'unlock'; pkg: string; ts: number };
export type IngestState = { lastEventMs: number; openPkg: string | null; openStartMs: number | null };
export type Session = { pkg: string; startMs: number; endMs: number; day: string };

export const INITIAL_STATE: IngestState = { lastEventMs: 0, openPkg: null, openStartMs: null };

/** Local midnight at the start of a YYYY-MM-DD day key. */
export function dayStartMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function nextMidnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function splitAtMidnight(pkg: string, startMs: number, endMs: number): Session[] {
  const out: Session[] = [];
  for (let s = startMs; s < endMs;) {
    const cut = Math.min(endMs, nextMidnight(s));
    out.push({ pkg, startMs: s, endMs: cut, day: localDate(s) });
    s = cut;
  }
  return out;
}

/**
 * Turns Android usage events into finished sessions and pickups. Pure: the caller stores the result and the new state.
 * ponytail: events with a timestamp equal to the cursor are treated as already seen; Android rarely writes two events
 * in the same millisecond across a query boundary, and the sessions unique index catches any repeat.
 */
export function ingest(events: RawEvent[], state: IngestState, ignore: ReadonlySet<string>) {
  const sessions: Session[] = [];
  const pickups: number[] = [];
  let { lastEventMs, openPkg, openStartMs } = state;

  const close = (end: number) => {
    if (openPkg !== null && openStartMs !== null && end > openStartMs) sessions.push(...splitAtMidnight(openPkg, openStartMs, end));
    openPkg = null;
    openStartMs = null;
  };

  const fresh = events.filter((e) => e.ts > lastEventMs).sort((a, b) => a.ts - b.ts);
  for (const e of fresh) {
    if (e.type === 'resumed' && e.pkg !== openPkg) {
      close(e.ts);
      if (!ignore.has(e.pkg)) { openPkg = e.pkg; openStartMs = e.ts; }
    } else if (e.type === 'paused' && e.pkg === openPkg) {
      close(e.ts);
    } else if (e.type === 'screen_off') {
      close(e.ts);
    } else if (e.type === 'unlock') {
      pickups.push(e.ts);
    }
    lastEventMs = e.ts;
  }
  return { sessions, pickups, state: { lastEventMs, openPkg, openStartMs } };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/tracking
git commit -m "feat(mobile): ingest usage events into sessions and pickups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: App categories

**Files:**
- Create: `apps/mobile/src/tracking/categories.ts`
- Test: `apps/mobile/src/tracking/categories.test.ts`

**Interfaces:**
- Produces: `CATEGORIES`, `type Category = 'social' | 'messages' | 'fun' | 'learning' | 'work' | 'other'`, `CATEGORY_LOOK: Record<Category, { label: string; color: string }>`, `isCategory(v: unknown): v is Category`, `categoryFor(pkg: string, androidCategory: number, userCategory: string | null): Category`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/tracking/categories.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_LOOK, categoryFor, isCategory } from './categories';

describe('categoryFor', () => {
  it('lets the user override everything', () => {
    expect(categoryFor('com.whatsapp', 4, 'work')).toBe('work');
  });

  it('uses the built-in list before Android’s category', () => {
    expect(categoryFor('com.whatsapp', 4, null)).toBe('messages'); // Android says SOCIAL
    expect(categoryFor('com.duolingo', 0, null)).toBe('learning'); // Android says GAME
  });

  it('maps Android categories', () => {
    expect(categoryFor('x.game', 0, null)).toBe('fun');
    expect(categoryFor('x.video', 2, null)).toBe('fun');
    expect(categoryFor('x.social', 4, null)).toBe('social');
    expect(categoryFor('x.tool', 7, null)).toBe('work');
    expect(categoryFor('x.maps', 6, null)).toBe('other');
  });

  it('falls back to other, and ignores a junk override', () => {
    expect(categoryFor('x.unknown', -1, null)).toBe('other');
    expect(categoryFor('x.unknown', -1, 'nonsense')).toBe('other');
  });

  it('has a label and colour for every category', () => {
    for (const c of CATEGORIES) expect(CATEGORY_LOOK[c].color).toMatch(/^#[0-9A-F]{6}$/);
    expect(isCategory('fun')).toBe(true);
    expect(isCategory('games')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./categories`.

- [ ] **Step 3: Implement**

`apps/mobile/src/tracking/categories.ts`:

```ts
export const CATEGORIES = ['social', 'messages', 'fun', 'learning', 'work', 'other'] as const;
export type Category = typeof CATEGORIES[number];

export const CATEGORY_LOOK: Record<Category, { label: string; color: string }> = {
  social: { label: 'Social', color: '#F4C6C8' },
  messages: { label: 'Messages', color: '#CFE6FB' },
  fun: { label: 'Fun', color: '#F9DDB9' },
  learning: { label: 'Learning', color: '#BFEBD3' },
  work: { label: 'Work', color: '#D8D2FC' },
  other: { label: 'Other', color: '#E9E3DD' }
};

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

// android.content.pm.ApplicationInfo.CATEGORY_*: GAME 0, AUDIO 1, VIDEO 2, IMAGE 3, SOCIAL 4, NEWS 5, MAPS 6, PRODUCTIVITY 7.
const ANDROID: Record<number, Category> = { 0: 'fun', 1: 'fun', 2: 'fun', 3: 'other', 4: 'social', 5: 'other', 6: 'other', 7: 'work' };

// Popular apps Android files wrongly (or not at all). ponytail: a short list; users fix the rest in Settings.
const KNOWN: Record<string, Category> = {
  'com.whatsapp': 'messages', 'com.whatsapp.w4b': 'messages', 'org.telegram.messenger': 'messages',
  'org.thoughtcrime.securesms': 'messages', 'com.google.android.gm': 'messages', 'com.google.android.apps.messaging': 'messages',
  'com.facebook.orca': 'messages', 'com.microsoft.office.outlook': 'messages', 'com.samsung.android.messaging': 'messages',
  'com.instagram.android': 'social', 'com.instagram.barcelona': 'social', 'com.facebook.katana': 'social',
  'com.zhiliaoapp.musically': 'social', 'com.ss.android.ugc.trill': 'social', 'com.snapchat.android': 'social',
  'com.twitter.android': 'social', 'com.reddit.frontpage': 'social', 'com.pinterest': 'social', 'com.discord': 'social',
  'com.google.android.youtube': 'fun', 'com.netflix.mediaclient': 'fun', 'com.spotify.music': 'fun',
  'in.startv.hotstar': 'fun', 'com.disney.disneyplus': 'fun', 'tv.twitch.android.app': 'fun', 'com.amazon.avod.thirdpartyclient': 'fun',
  'com.duolingo': 'learning', 'org.khanacademy.android': 'learning', 'com.google.android.apps.classroom': 'learning',
  'com.amazon.kindle': 'learning', 'com.quizlet.quizletandroid': 'learning', 'org.coursera.android': 'learning',
  'com.slack': 'work', 'com.microsoft.teams': 'work', 'notion.id': 'work', 'com.google.android.apps.docs': 'work',
  'com.google.android.calendar': 'work', 'us.zoom.videomeetings': 'work', 'com.linkedin.android': 'work'
};

export function categoryFor(pkg: string, androidCategory: number, userCategory: string | null): Category {
  if (isCategory(userCategory)) return userCategory;
  return KNOWN[pkg] ?? ANDROID[androidCategory] ?? 'other';
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/tracking/categories.ts apps/mobile/src/tracking/categories.test.ts
git commit -m "feat(mobile): app category rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Native module `daily-native` (Kotlin)

**Files:**
- Create: `apps/mobile/modules/daily-native/expo-module.config.json`, `index.ts`, `android/build.gradle`, `android/src/main/AndroidManifest.xml`, `android/src/main/java/expo/modules/dailynative/DailyNativeModule.kt`

**Interfaces:**
- Produces (JS, default export of `modules/daily-native`):
  - `packageName(): string`
  - `hasUsageAccess(): boolean`
  - `openUsageAccessSettings(): void`
  - `defaultLauncher(): string | null`
  - `queryEvents(fromMs: number, toMs: number): Promise<NativeEvent[]>` where `NativeEvent` has the same shape as `RawEvent`
  - `appInfo(packages: string[]): Promise<NativeAppInfo[]>`, `NativeAppInfo = { pkg: string; label: string; category: number; icon: string | null }` (icon = base64 PNG 96 px)

- [ ] **Step 1: Module config and Gradle file**

`apps/mobile/modules/daily-native/expo-module.config.json`:

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.dailynative.DailyNativeModule"]
  }
}
```

`apps/mobile/modules/daily-native/android/build.gradle`:

```gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.dailynative'
version = '0.1.0'

android {
  namespace "expo.modules.dailynative"
  defaultConfig {
    versionCode 1
    versionName "0.1.0"
  }
  lintOptions {
    abortOnError false
  }
}
```

(These match what `npx create-expo-module@57 --local` generates; writing them by hand avoids its interactive prompts.)

- [ ] **Step 2: Manifest — permission and app visibility**

`apps/mobile/modules/daily-native/android/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
  xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" tools:ignore="ProtectedPermissions" />
  <queries>
    <intent>
      <action android:name="android.intent.action.MAIN" />
      <category android:name="android.intent.category.LAUNCHER" />
    </intent>
    <intent>
      <action android:name="android.intent.action.MAIN" />
      <category android:name="android.intent.category.HOME" />
    </intent>
  </queries>
</manifest>
```

- [ ] **Step 3: Kotlin module**

`apps/mobile/modules/daily-native/android/src/main/java/expo/modules/dailynative/DailyNativeModule.kt`:

```kotlin
package expo.modules.dailynative

import android.Manifest
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

class DailyNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DailyNative")

    Function("packageName") { context.packageName }

    Function("hasUsageAccess") { hasUsageAccess() }

    Function("openUsageAccessSettings") {
      context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("defaultLauncher") {
      val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      context.packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
    }

    AsyncFunction("queryEvents") { fromMs: Double, toMs: Double -> queryEvents(fromMs.toLong(), toMs.toLong()) }

    AsyncFunction("appInfo") { packages: List<String> -> packages.map { appInfo(it) } }
  }

  private fun hasUsageAccess(): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= 29) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    if (mode == AppOpsManager.MODE_DEFAULT) {
      return context.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun queryEvents(from: Long, to: Long): List<Map<String, Any>> {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val events = usm.queryEvents(from, to)
    val e = UsageEvents.Event()
    val out = ArrayList<Map<String, Any>>()
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      val type = when (e.eventType) {
        1 -> "resumed"      // ACTIVITY_RESUMED (MOVE_TO_FOREGROUND before API 29)
        2 -> "paused"       // ACTIVITY_PAUSED (MOVE_TO_BACKGROUND before API 29)
        15 -> "screen_on"   // SCREEN_INTERACTIVE
        16 -> "screen_off"  // SCREEN_NON_INTERACTIVE
        18 -> "unlock"      // KEYGUARD_HIDDEN
        else -> null
      } ?: continue
      out.add(mapOf("type" to type, "pkg" to e.packageName, "ts" to e.timeStamp.toDouble()))
    }
    return out
  }

  private fun appInfo(pkg: String): Map<String, Any?> {
    val pm = context.packageManager
    return try {
      val ai = pm.getApplicationInfo(pkg, 0)
      mapOf(
        "pkg" to pkg,
        "label" to pm.getApplicationLabel(ai).toString(),
        "category" to (if (Build.VERSION.SDK_INT >= 26) ai.category else -1),
        "icon" to iconPng(pm.getApplicationIcon(ai))
      )
    } catch (e: PackageManager.NameNotFoundException) {
      mapOf("pkg" to pkg, "label" to pkg, "category" to -1, "icon" to null)
    }
  }

  private fun iconPng(d: Drawable): String {
    val size = 96
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    d.setBounds(0, 0, size, size)
    d.draw(Canvas(bmp))
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }
}
```

- [ ] **Step 4: JS wrapper**

`apps/mobile/modules/daily-native/index.ts`:

```ts
import { requireNativeModule } from 'expo';

export type NativeEvent = { type: 'resumed' | 'paused' | 'screen_on' | 'screen_off' | 'unlock'; pkg: string; ts: number };
export type NativeAppInfo = { pkg: string; label: string; category: number; icon: string | null };

export type DailyNativeApi = {
  packageName(): string;
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  defaultLauncher(): string | null;
  queryEvents(fromMs: number, toMs: number): Promise<NativeEvent[]>;
  appInfo(packages: string[]): Promise<NativeAppInfo[]>;
};

export default requireNativeModule<DailyNativeApi>('DailyNative');
```

- [ ] **Step 5: Build and check on the emulator**

Temporarily replace the body of `apps/mobile/app/index.tsx`'s component with a log (revert in Step 6):

```tsx
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import DailyNative from '../modules/daily-native';

export default function Home() {
  useEffect(() => {
    console.log('access', DailyNative.hasUsageAccess(), 'launcher', DailyNative.defaultLauncher());
    DailyNative.queryEvents(Date.now() - 3_600_000, Date.now()).then((ev) => console.log('events', ev.length, ev.slice(-3)));
    DailyNative.appInfo(['com.android.chrome']).then((a) => console.log('chrome', a[0]?.label, a[0]?.category, (a[0]?.icon ?? '').length));
  }, []);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Daily</Text></View>;
}
```

Run: `pnpm --filter @worksight/mobile android`
Then: `adb shell appops set com.aaronalex.daily GET_USAGE_STATS allow`, open and close Chrome on the emulator, reopen Daily (press `r` in Metro to reload).
Expected in Metro logs: `access true launcher com.google.android.apps.nexuslauncher` (or the emulator's launcher), `events N [...]` with `resumed`/`paused` entries, `chrome Chrome <number> <non-zero length>`.
Before granting access, `access false` must print without a crash.

- [ ] **Step 6: Revert the temporary screen and commit**

Restore `apps/mobile/app/index.tsx` to the Task 1 version.

```bash
git add apps/mobile/modules apps/mobile/app/index.tsx
git commit -m "feat(mobile): daily-native Kotlin module for usage events and app info

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Sync — native events into the database

**Files:**
- Create: `apps/mobile/src/tracking/sync.ts`, `src/tracking/runSync.ts`, `src/tracking/backgroundTask.ts`
- Test: `apps/mobile/src/tracking/sync.test.ts`

**Interfaces:**
- Consumes: `Db`, `getNumber`, `ingest`, `INITIAL_STATE`, `dayStartMs`, `IngestState`, `RawEvent`, `categoryFor`, `moodFor`, `localDate`, `DailyNativeApi` (type only).
- Produces:
  - `type SyncNative = Pick<DailyNativeApi, 'packageName' | 'defaultLauncher' | 'hasUsageAccess' | 'queryEvents' | 'appInfo'>`
  - `sync(db: Db, native: SyncNative, nowMs: number): Promise<'ok' | 'no_access'>`
  - `loadState(db): IngestState`, `phoneMsForDay(db, day, nowMs): number` (finished sessions + the open app's time today)
  - `runSync(): Promise<'ok' | 'no_access'>` (app; one at a time)
  - `registerSyncTask(): Promise<void>`, `SYNC_TASK = 'daily-sync'`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/tracking/sync.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import type { RawEvent } from './ingest';
import { loadState, phoneMsForDay, sync, type SyncNative } from './sync';

const at = (h: number, m = 0, d = 6) => new Date(2026, 9, d, h, m).getTime();

function fakeNative(events: RawEvent[], access = true): SyncNative & { appInfo: ReturnType<typeof vi.fn> } {
  return {
    packageName: () => 'com.aaronalex.daily',
    defaultLauncher: () => 'launcher',
    hasUsageAccess: () => access,
    queryEvents: async (from, to) => events.filter((e) => e.ts >= from && e.ts < to),
    appInfo: vi.fn(async (pkgs: string[]) => pkgs.map((pkg) => ({ pkg, label: pkg.toUpperCase(), category: 4, icon: null })))
  };
}

const morning: RawEvent[] = [
  { type: 'unlock', pkg: 'android', ts: at(8) },
  { type: 'resumed', pkg: 'com.whatsapp', ts: at(8, 1) },
  { type: 'resumed', pkg: 'com.aaronalex.daily', ts: at(8, 11) },
  { type: 'resumed', pkg: 'com.instagram.android', ts: at(8, 15) },
  { type: 'screen_off', pkg: 'android', ts: at(8, 45) }
];

describe('sync', () => {
  it('does nothing without usage access (Review Focus 3)', async () => {
    const db = await makeTestDb();
    expect(await sync(db, fakeNative(morning, false), at(9))).toBe('no_access');
    expect(db.all('SELECT * FROM sessions')).toEqual([]);
  });

  it('stores sessions, pickups, apps and state; skips Daily itself', async () => {
    const db = await makeTestDb();
    expect(await sync(db, fakeNative(morning), at(9))).toBe('ok');
    const rows = db.all<{ package: string; start_ms: number; end_ms: number }>('SELECT package, start_ms, end_ms FROM sessions ORDER BY start_ms');
    expect(rows.map((r) => r.package)).toEqual(['com.whatsapp', 'com.instagram.android']);
    expect(db.all('SELECT * FROM pickups')).toHaveLength(1);
    const apps = db.all<{ package: string; category: string; label: string }>('SELECT package, category, label FROM apps ORDER BY package');
    expect(apps).toEqual([
      { package: 'com.instagram.android', category: 'social', label: 'COM.INSTAGRAM.ANDROID' },
      { package: 'com.whatsapp', category: 'messages', label: 'COM.WHATSAPP' }
    ]);
    expect(loadState(db).lastEventMs).toBe(at(8, 45));
  });

  it('re-sync returns no duplicates (Review Focus 1)', async () => {
    const db = await makeTestDb();
    const native = fakeNative(morning);
    await sync(db, native, at(9));
    db.run('UPDATE ingest_state SET last_event_ms = 0'); // force the same events to be read again
    await sync(db, native, at(9, 5));
    expect(db.all('SELECT * FROM sessions')).toHaveLength(2);
    expect(db.all('SELECT * FROM pickups')).toHaveLength(1);
  });

  it('asks Android about each app only once', async () => {
    const db = await makeTestDb();
    const native = fakeNative(morning);
    await sync(db, native, at(9));
    await sync(db, native, at(9, 5));
    expect(native.appInfo).toHaveBeenCalledTimes(1);
  });

  it('logs a mood only when it changes', async () => {
    const db = await makeTestDb();
    setSetting(db, 'goal_min', 60);
    await sync(db, fakeNative(morning), at(9)); // 40 min of 60 → happy
    await sync(db, fakeNative(morning), at(9, 1));
    expect(db.all<{ mood: string }>('SELECT mood FROM mood_log').map((r) => r.mood)).toEqual(['happy']);
    setSetting(db, 'goal_min', 30); // 40 of 30 → sad
    await sync(db, fakeNative(morning), at(9, 2));
    expect(db.all<{ mood: string }>('SELECT mood FROM mood_log ORDER BY ts_ms').map((r) => r.mood)).toEqual(['happy', 'sad']);
  });

  it('counts the app that is still open', async () => {
    const db = await makeTestDb();
    await sync(db, fakeNative([{ type: 'resumed', pkg: 'com.a', ts: at(10) }]), at(10, 20));
    expect(phoneMsForDay(db, '2026-10-06', at(10, 20))).toBe(20 * 60_000);
  });

  it('deletes history older than the retention setting', async () => {
    const db = await makeTestDb();
    setSetting(db, 'retention_days', 30);
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('old', 1, 2, '2026-08-01')");
    db.run("INSERT INTO pickups (ts_ms, day) VALUES (1, '2026-08-01')");
    await sync(db, fakeNative(morning), at(9));
    expect(db.all("SELECT * FROM sessions WHERE package = 'old'")).toEqual([]);
    expect(db.all("SELECT * FROM pickups WHERE day = '2026-08-01'")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./sync`.

- [ ] **Step 3: Implement `sync.ts`**

`apps/mobile/src/tracking/sync.ts`:

```ts
import { localDate } from '@worksight/core/date';
import type { DailyNativeApi } from '../../modules/daily-native';
import type { Db } from '../db/db';
import { getNumber } from '../db/settings';
import { moodFor } from '../sunny/mood';
import { categoryFor } from './categories';
import { dayStartMs, ingest, INITIAL_STATE, type IngestState } from './ingest';

export type SyncNative = Pick<DailyNativeApi, 'packageName' | 'defaultLauncher' | 'hasUsageAccess' | 'queryEvents' | 'appInfo'>;

const DAY_MS = 86_400_000;
const BACKFILL_MS = 7 * DAY_MS;

export function loadState(db: Db): IngestState {
  const r = db.get<{ last_event_ms: number; open_pkg: string | null; open_start_ms: number | null }>('SELECT * FROM ingest_state WHERE id = 1');
  return r ? { lastEventMs: r.last_event_ms, openPkg: r.open_pkg, openStartMs: r.open_start_ms } : INITIAL_STATE;
}

function saveState(db: Db, s: IngestState): void {
  db.run(
    `INSERT INTO ingest_state (id, last_event_ms, open_pkg, open_start_ms) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_event_ms = excluded.last_event_ms, open_pkg = excluded.open_pkg, open_start_ms = excluded.open_start_ms`,
    [s.lastEventMs, s.openPkg, s.openStartMs]
  );
}

/** Finished sessions of `day` plus the still-open app's time inside that day, up to now. */
export function phoneMsForDay(db: Db, day: string, nowMs: number): number {
  const done = db.get<{ ms: number | null }>('SELECT SUM(end_ms - start_ms) AS ms FROM sessions WHERE day = ?', [day])?.ms ?? 0;
  const s = loadState(db);
  if (s.openPkg === null || s.openStartMs === null) return done;
  const start = Math.max(s.openStartMs, dayStartMs(day));
  const end = Math.min(nowMs, dayStartMs(day) + DAY_MS);
  return done + Math.max(0, end - start);
}

function logMood(db: Db, nowMs: number): void {
  const day = localDate(nowMs);
  const mood = moodFor(phoneMsForDay(db, day, nowMs) / 60_000, getNumber(db, 'goal_min'));
  const last = db.get<{ mood: string }>('SELECT mood FROM mood_log WHERE day = ? ORDER BY ts_ms DESC LIMIT 1', [day])?.mood;
  if (last !== mood) db.run('INSERT INTO mood_log (day, ts_ms, mood) VALUES (?, ?, ?)', [day, nowMs, mood]);
}

function sweep(db: Db, nowMs: number): void {
  const cutoff = localDate(nowMs - getNumber(db, 'retention_days') * DAY_MS);
  for (const table of ['sessions', 'pickups', 'mood_log']) db.run(`DELETE FROM ${table} WHERE day < ?`, [cutoff]);
}

export async function sync(db: Db, native: SyncNative, nowMs: number): Promise<'ok' | 'no_access'> {
  if (!native.hasUsageAccess()) return 'no_access';
  const state = loadState(db);
  const events = await native.queryEvents(Math.max(state.lastEventMs, nowMs - BACKFILL_MS), nowMs);
  const ignore = new Set([native.packageName(), 'com.android.systemui', native.defaultLauncher() ?? '']);
  const res = ingest(events, state, ignore);

  const known = new Set(db.all<{ package: string }>('SELECT package FROM apps').map((r) => r.package));
  const seen = new Set(res.sessions.map((s) => s.pkg));
  if (res.state.openPkg) seen.add(res.state.openPkg);
  const fresh = [...seen].filter((p) => !known.has(p));
  const infos = fresh.length > 0 ? await native.appInfo(fresh) : [];

  db.tx(() => {
    for (const s of res.sessions) {
      db.run('INSERT OR IGNORE INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [s.pkg, s.startMs, s.endMs, s.day]);
    }
    for (const t of res.pickups) db.run('INSERT OR IGNORE INTO pickups (ts_ms, day) VALUES (?, ?)', [t, localDate(t)]);
    for (const a of infos) {
      db.run('INSERT OR IGNORE INTO apps (package, label, category, icon_png) VALUES (?, ?, ?, ?)', [a.pkg, a.label, categoryFor(a.pkg, a.category, null), a.icon]);
    }
    saveState(db, res.state);
    logMood(db, nowMs);
    sweep(db, nowMs);
  });
  return 'ok';
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: App wiring (no unit test — exercised on the emulator in Task 11)**

`apps/mobile/src/tracking/runSync.ts`:

```ts
import DailyNative from '../../modules/daily-native';
import { getDb } from '../db/expoDb';
import { sync } from './sync';

let running: Promise<'ok' | 'no_access'> | null = null;

/** One sync at a time: the foreground refresh and the background task share this promise. */
export function runSync(): Promise<'ok' | 'no_access'> {
  running ??= sync(getDb(), DailyNative, Date.now()).finally(() => { running = null; });
  return running;
}
```

`apps/mobile/src/tracking/backgroundTask.ts`:

```ts
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runSync } from './runSync';

export const SYNC_TASK = 'daily-sync';

// Must run at module load (imported from the root layout) so Android can wake the task with the app closed.
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    await runSync();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerSyncTask(): Promise<void> {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) return;
  await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 });
}
```

If the installed `expo-background-task` names differ, follow `node_modules/expo-background-task/build/BackgroundTask.d.ts` and keep the behaviour: register once, 15-minute minimum, run `runSync()`.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @worksight/mobile typecheck`
Expected: no errors.

```bash
git add apps/mobile/src/tracking
git commit -m "feat(mobile): sync usage into sqlite with mood log, retention and background task

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Theme, fonts, tab shell, logo and fatal screen

**Files:**
- Create: `apps/mobile/src/theme.ts`, `src/format.ts`, `src/ui/icons.tsx`, `src/ui/Logo.tsx`, `src/ui/TabBar.tsx`, `src/ui/motion.ts`, `src/ui/FatalScreen.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx` (temporary body, real screen in Task 11)
- Modify: `apps/mobile/app/_layout.tsx`
- Delete: `apps/mobile/app/index.tsx`
- Test: `apps/mobile/src/format.test.ts`

**Interfaces:**
- Produces:
  - `C` (colours), `F` (`{ regular: 'DMSans_400Regular', medium: 'DMSans_500Medium', semi: 'DMSans_600SemiBold' }`), `EASE`, `SPRING_PRESS`
  - `formatDuration(min: number): string` ("0m", "48m", "3h 12m", "4h"), `hourLabel(h: number): string` ("7 am", "12 pm", "11 pm", "12 am")
  - `<Icon name size color />` with names `home | report | week | bell | gear | back | plus | minus | grid | social | messages | fun | learning | work | other | lock | eyeOff`
  - `<Logo size />`, `<TabBar {...BottomTabBarProps} />`, `rise(index: number)` (entering animation), `<FatalScreen error onExport onReset />`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration, hourLabel } from './format';

describe('formatDuration', () => {
  it.each([[0, '0m'], [0.4, '0m'], [48, '48m'], [60, '1h'], [192, '3h 12m'], [240, '4h'], [59.6, '1h']])('%s → %s', (min, out) => {
    expect(formatDuration(min)).toBe(out);
  });
});

describe('hourLabel', () => {
  it.each([[0, '12 am'], [7, '7 am'], [12, '12 pm'], [15, '3 pm'], [23, '11 pm'], [24, '12 am']])('%s → %s', (h, out) => {
    expect(hourLabel(h)).toBe(out);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./format`.

- [ ] **Step 3: Implement format + theme**

`apps/mobile/src/format.ts`:

```ts
export function formatDuration(min: number): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function hourLabel(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  const twelve = hh % 12 === 0 ? 12 : hh % 12;
  return `${twelve} ${hh < 12 ? 'am' : 'pm'}`;
}
```

`apps/mobile/src/theme.ts`:

```ts
import { Easing } from 'react-native-reanimated';

export const C = {
  bg: '#FBF8F4', panel: '#F2EBE6', ink: '#171717', muted: '#77716C', line: '#E7DFD8', white: '#FFFFFF',
  body: '#4A4541', ok: '#34C38F', danger: '#B3261E'
} as const;

export const F = { regular: 'DMSans_400Regular', medium: 'DMSans_500Medium', semi: 'DMSans_600SemiBold' } as const;

export const EASE = Easing.bezier(0.22, 0.8, 0.26, 1);
export const SPRING_PRESS = { damping: 14, stiffness: 260 } as const;
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: UI building blocks**

`apps/mobile/src/ui/icons.tsx` (paths are the mockup's stroke icons):

```tsx
import Svg, { Path } from 'react-native-svg';

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  report: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6M8 13h8M8 17h5',
  week: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  back: 'm15 6-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  social: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  messages: 'M3 5h18v14H3z m0 2 9 6 9-6',
  fun: 'M3 5h18v14H3z M10 9l5 3-5 3z',
  learning: 'M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z',
  work: 'M3 4h18v12H3z M8 20h8M12 16v4',
  other: 'M6 12h.01M12 12h.01M18 12h.01',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  eyeOff: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M3 3l18 18'
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, color = '#171717' }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={PATHS[name]} stroke={color} strokeWidth={name === 'other' ? 3 : 1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
```

`apps/mobile/src/ui/Logo.tsx` (smiling sunrise from the "Daily logo" board):

```tsx
import Svg, { Circle, ClipPath, Defs, Path, Rect } from 'react-native-svg';

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Daily">
      <Defs><ClipPath id="sky"><Rect width="100" height="64" /></ClipPath></Defs>
      <Rect width="100" height="100" rx="24" fill="#171717" />
      <Circle cx="50" cy="64" r="21" fill="#F6B35E" clipPath="url(#sky)" />
      <Path d="M43.5 52 L43.5 54 M56.5 52 L56.5 54" stroke="#3A2412" strokeWidth={3.8} strokeLinecap="round" />
      <Path d="M44.8 57.6 Q50 61.4 55.2 57.6" stroke="#3A2412" strokeWidth={2.8} strokeLinecap="round" fill="none" />
      <Path d="M19.01,48.92 Q13.78,46.51 8.74,44.59 M31.48,34.27 Q28.33,30.03 25.87,25.86 M50.03,29.24 Q49.51,23.88 50.04,18.51 M67.62,34.54 Q71.02,29.32 74.51,23.81 M79.18,48.33 Q85.67,44.75 92.19,42.23" stroke="#F6B35E" strokeWidth={7} strokeLinecap="round" fill="none" />
      <Path d="M14,67 C17,66.58 26,64.5 32,64.5 C38,64.5 44,67 50,67 C56,67 62,64.58 68,64.5 C74,64.42 83,66.17 86,66.5" stroke="#FBF8F4" strokeWidth={6} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
```

`apps/mobile/src/ui/motion.ts`:

```ts
import { FadeInDown } from 'react-native-reanimated';
import { EASE } from '../theme';

/** Staggered rise-in for the n-th block on a screen. Turns itself off when Android's "Remove animations" is on. */
export function rise(index: number) {
  return FadeInDown.duration(700).delay(index * 60).easing(EASE);
}
```

`apps/mobile/src/ui/TabBar.tsx`:

```tsx
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import { Icon, type IconName } from './icons';

const TAB_ICON: Record<string, IconName> = { index: 'home', report: 'report', week: 'week', reminders: 'bell' };

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} style={s.tab}>
            <View style={[s.pill, focused && s.pillOn]}>
              <Icon name={TAB_ICON[route.name] ?? 'home'} color={focused ? C.white : C.muted} />
            </View>
            <Text style={[s.label, focused && { color: C.ink }]}>{descriptors[route.key].options.title ?? route.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, paddingHorizontal: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 48, justifyContent: 'center' },
  pill: { width: 52, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.ink },
  label: { fontFamily: F.medium, fontSize: 11, color: C.muted }
});
```

`apps/mobile/src/ui/FatalScreen.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { C, F } from '../theme';

export function FatalScreen({ error, onExport, onReset }: { error: string; onExport: () => void; onReset: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 24, color: C.ink, fontWeight: '600' }}>Something went wrong</Text>
      <Text style={{ fontSize: 14, color: C.body }}>Daily couldn't open its data. You can save a copy, then start fresh.</Text>
      <Text style={{ fontSize: 12, color: C.muted }}>{error}</Text>
      <Pressable onPress={onExport} style={{ minHeight: 48, borderRadius: 999, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.ink, fontFamily: F.semi }}>Save a copy</Text>
      </Pressable>
      <Pressable onPress={onReset} style={{ minHeight: 48, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.white, fontFamily: F.semi }}>Start fresh</Text>
      </Pressable>
    </View>
  );
}
```

(Fonts may not be loaded when this shows, so it uses `fontWeight` for the title.)

- [ ] **Step 6: Root layout and tabs**

Delete `apps/mobile/app/index.tsx`.

`apps/mobile/app/_layout.tsx`:

```tsx
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, useFonts } from '@expo-google-fonts/dm-sans';
import { File, Paths } from 'expo-file-system';
import { Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as SplashScreen from 'expo-splash-screen';
import { deleteDatabaseSync } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { DB_NAME, getDb } from '../src/db/expoDb';
import { registerSyncTask } from '../src/tracking/backgroundTask';
import { C } from '../src/theme';
import { FatalScreen } from '../src/ui/FatalScreen';

SplashScreen.preventAutoHideAsync();

function openDb(): string | null {
  try { getDb(); return null; } catch (e) { return String(e); }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold });
  const [dbError, setDbError] = useState<string | null>(openDb);

  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync(); }, [fontsLoaded]);
  useEffect(() => { if (!dbError) registerSyncTask().catch(() => {}); }, [dbError]);

  if (!fontsLoaded) return null;
  if (dbError) {
    return (
      <FatalScreen
        error={dbError}
        onExport={() => Sharing.shareAsync(new File(Paths.document, 'SQLite', DB_NAME).uri)}
        onReset={() => { deleteDatabaseSync(DB_NAME); setDbError(openDb()); }}
      />
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
```

(Check `expo-file-system`'s `File`/`Paths` and `expo-sqlite`'s `deleteDatabaseSync` exist in the installed versions' `.d.ts`; the database file lives in `<document>/SQLite/daily.db`.)

`apps/mobile/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';
import { TabBar } from '../../src/ui/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
    </Tabs>
  );
}
```

`apps/mobile/app/(tabs)/index.tsx` (temporary; replaced in Task 11):

```tsx
import { Text, View } from 'react-native';
import { C, F } from '../../src/theme';
import { Logo } from '../../src/ui/Logo';

export default function Today() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Logo size={64} />
      <Text style={{ fontFamily: F.semi, fontSize: 28, color: C.ink }}>Daily</Text>
    </View>
  );
}
```

- [ ] **Step 7: Check on the emulator**

Run: `pnpm --filter @worksight/mobile android`
Expected: splash → cream screen with the smiling logo and "Daily" in DM Sans; bottom bar with a black "Today" pill. Importing `backgroundTask` must not crash.

- [ ] **Step 8: Typecheck and commit**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`
Expected: no errors, all tests pass.

```bash
git add apps/mobile
git commit -m "feat(mobile): theme, fonts, tab shell, logo and fatal screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Sunny — animated buddy

**Files:**
- Create: `apps/mobile/src/sunny/look.ts`, `src/sunny/Sunny.tsx`, `app/dev/sunny.tsx`
- Test: `apps/mobile/src/sunny/look.test.ts`

**Interfaces:**
- Consumes: `Mood`, `MOODS`.
- Produces: `type SunnyFace = Mood | 'unknown'`, `LOOK: Record<SunnyFace, MoodLook>`, `raysPath(n: number, len: number): string`, `<Sunny face: SunnyFace; size: number />`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/sunny/look.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LOOK, raysPath } from './look';
import { MOODS } from './mood';

describe('raysPath', () => {
  it('draws nothing for zero rays', () => {
    expect(raysPath(0, 10)).toBe('');
  });

  it('starts the first ray straight up from radius 42', () => {
    expect(raysPath(4, 10).startsWith('M60.0 18.0 L60.0 8.0')).toBe(true);
    expect(raysPath(4, 10).match(/M/g)).toHaveLength(4);
  });
});

describe('LOOK', () => {
  it('has a look for every mood plus unknown, dimming as the mood drops', () => {
    for (const m of [...MOODS, 'unknown' as const]) expect(LOOK[m].body).toMatch(/^#/);
    expect(MOODS.map((m) => LOOK[m].rays)).toEqual([12, 12, 10, 9, 8]);
    expect(LOOK.sad.tear && LOOK.sad.cloud).toBe(true);
    expect(LOOK.glowing.sparkle).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./look`.

- [ ] **Step 3: Implement `look.ts`** (values copied from the mockup's `Sun.dc.html`)

`apps/mobile/src/sunny/look.ts`:

```ts
import type { Mood } from './mood';

export type SunnyFace = Mood | 'unknown';

export type MoodLook = {
  body: string; edge: string;
  glow: [number, number];        // glow opacity pulse from → to
  sparkle: boolean;
  rays: number; rayLen: number;
  spinSec: number;               // 0 = still
  bob: number; bobSec: number;   // viewBox units; negative = up
  cheek: number;
  eyes: string; brows: string; mouth: string; mouthFill: string;
  tear: boolean; cloud: boolean; question: boolean;
};

export const LOOK: Record<SunnyFace, MoodLook> = {
  glowing: { body: '#FFB547', edge: '#EE8A1C', glow: [0.38, 0.16], sparkle: true, rays: 12, rayLen: 15, spinSec: 22, bob: -4, bobSec: 2.2, cheek: 0.6,
    eyes: 'M41 56 Q46.5 49 52 56 M68 56 Q73.5 49 79 56', brows: '', mouth: 'M45 65 Q60 84 75 65 Z', mouthFill: '#8A3214', tear: false, cloud: false, question: false },
  happy: { body: '#F6B35E', edge: '#E3973A', glow: [0.22, 0.1], sparkle: false, rays: 12, rayLen: 12, spinSec: 40, bob: -3, bobSec: 2.8, cheek: 0.42,
    eyes: 'M47 51.5 L47 56 M73 51.5 L73 56', brows: '', mouth: 'M47 66 Q60 78 73 66', mouthFill: 'none', tear: false, cloud: false, question: false },
  alright: { body: '#F3C47F', edge: '#D9A55C', glow: [0.08, 0.04], sparkle: false, rays: 10, rayLen: 9, spinSec: 0, bob: -2, bobSec: 3.4, cheek: 0.18,
    eyes: 'M48 52.5 L48 56 M74 52.5 L74 56', brows: 'M42 46 L52 45.5 M68 45.5 L78 46', mouth: 'M50 69.5 Q60 71.5 70 68', mouthFill: 'none', tear: false, cloud: false, question: false },
  fading: { body: '#E4C796', edge: '#C4A577', glow: [0, 0], sparkle: false, rays: 9, rayLen: 6, spinSec: 0, bob: 1.5, bobSec: 4, cheek: 0,
    eyes: 'M41 55 L53 55 M67 55 L79 55 M47 58 L47 58.6 M73 58 L73 58.6', brows: '', mouth: 'M50 72 Q55 69 60 72 Q65 75 70 72', mouthFill: 'none', tear: false, cloud: false, question: false },
  sad: { body: '#D2C3AD', edge: '#A99A85', glow: [0, 0], sparkle: false, rays: 8, rayLen: 3, spinSec: 0, bob: 3, bobSec: 4.6, cheek: 0,
    eyes: 'M47 54.5 L47 57.5 M73 54.5 L73 57.5', brows: 'M41 49 L51 45.5 M79 49 L69 45.5', mouth: 'M48 75 Q60 64 72 75', mouthFill: 'none', tear: true, cloud: true, question: false },
  unknown: { body: '#E9E3DD', edge: '#C9C0B6', glow: [0, 0], sparkle: false, rays: 0, rayLen: 0, spinSec: 0, bob: -1.5, bobSec: 3.4, cheek: 0,
    eyes: 'M48 53 L48 56 M72 53 L72 56', brows: '', mouth: 'M51 70 L69 70', mouthFill: 'none', tear: false, cloud: false, question: true }
};

/** SVG path for `n` rays of length `len`, starting at radius 42 around (60,60), first ray pointing up. */
export function raysPath(n: number, len: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n - Math.PI / 2;
    const p = (r: number) => `${(60 + r * Math.cos(a)).toFixed(1)} ${(60 + r * Math.sin(a)).toFixed(1)}`;
    d += `M${p(42)} L${p(42 + len)} `;
  }
  return d.trim();
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: Implement `<Sunny>`** — layered views so every loop is a plain View transform

`apps/mobile/src/sunny/Sunny.tsx`:

```tsx
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { F } from '../theme';
import { LOOK, raysPath, type SunnyFace } from './look';

const INK = '#3A2412';
const box = '0 0 120 120';
const fill = StyleSheet.absoluteFill;
const LABEL: Record<SunnyFace, string> = {
  glowing: 'Sunny is glowing', happy: 'Sunny is happy', alright: 'Sunny is alright', fading: 'Sunny is fading', sad: 'Sunny is sad', unknown: "Sunny can't see your day yet"
};

export function Sunny({ face, size }: { face: SunnyFace; size: number }) {
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={LABEL[face]}>
      <Animated.View key={face} entering={FadeIn.duration(600)} exiting={FadeOut.duration(300)} style={fill}>
        <Face face={face} size={size} />
      </Animated.View>
    </View>
  );
}

function loop(sv: { value: number }, to: number, ms: number) {
  sv.value = withRepeat(withSequence(withTiming(to, { duration: ms, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: ms, easing: Easing.inOut(Easing.sin) })), -1);
}

function Face({ face, size }: { face: SunnyFace; size: number }) {
  const L = LOOK[face];
  const reduced = useReducedMotion();
  const unit = size / 120;
  const spin = useSharedValue(0);
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);
  const glow = useSharedValue(0);
  const drip = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    if (L.spinSec > 0) spin.value = withRepeat(withTiming(360, { duration: L.spinSec * 1000, easing: Easing.linear }), -1);
    loop(bob, L.bob * unit, L.bobSec * 500);
    blink.value = withRepeat(withSequence(withDelay(4400, withTiming(0.1, { duration: 110 })), withTiming(1, { duration: 110 })), -1);
    loop(glow, 1, 1500);
    if (L.tear) loop(drip, 7 * unit, 1600);
    if (L.cloud) loop(drift, -5 * unit, 3500);
  }, [reduced, L, unit, spin, bob, blink, glow, drip, drift]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: L.glow[0] + (L.glow[1] - L.glow[0]) * glow.value }));
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const tearStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drip.value }] }));
  const cloudStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drift.value }] }));

  return (
    <>
      <Animated.View style={[fill, glowStyle]}>
        <Svg width="100%" height="100%" viewBox={box}><Circle cx="60" cy="60" r="52" fill={L.body} /></Svg>
      </Animated.View>
      {L.sparkle && (
        <Svg style={fill} width="100%" height="100%" viewBox={box}>
          <Path d="M14 14 L16 20 L22 22 L16 24 L14 30 L12 24 L6 22 L12 20 Z M104 92 L105.5 96.5 L110 98 L105.5 99.5 L104 104 L102.5 99.5 L98 98 L102.5 96.5 Z" fill="#FFC861" />
        </Svg>
      )}
      <Animated.View style={[fill, bobStyle]}>
        <Animated.View style={[fill, spinStyle]}>
          <Svg width="100%" height="100%" viewBox={box}><Path d={raysPath(L.rays, L.rayLen)} stroke={L.edge} strokeWidth={5.5} strokeLinecap="round" fill="none" /></Svg>
        </Animated.View>
        <Svg style={fill} width="100%" height="100%" viewBox={box}>
          <Circle cx="60" cy="60" r="33" fill={L.body} stroke={L.edge} strokeWidth={3} />
          <Ellipse cx="40" cy="65" rx="6" ry="3.5" fill="#F2836B" opacity={L.cheek} />
          <Ellipse cx="80" cy="65" rx="6" ry="3.5" fill="#F2836B" opacity={L.cheek} />
          {L.brows !== '' && <Path d={L.brows} stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none" />}
          <Path d={L.mouth} stroke={INK} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill={L.mouthFill} />
        </Svg>
        <Animated.View style={[fill, eyeStyle, { transformOrigin: '50% 45%' }]}>
          <Svg width="100%" height="100%" viewBox={box}><Path d={L.eyes} stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>
        </Animated.View>
        {L.tear && (
          <Animated.View style={[fill, tearStyle]}>
            <Svg width="100%" height="100%" viewBox={box}><Path d="M44 61 Q41.4 66.5 44 68.5 Q46.6 66.5 44 61 Z" fill="#7DB8EE" /></Svg>
          </Animated.View>
        )}
      </Animated.View>
      {L.cloud && (
        <Animated.View style={[fill, cloudStyle]}>
          <Svg width="100%" height="100%" viewBox={box}><Path d="M70 46 a9 9 0 0 1 4 -17 a12 12 0 0 1 22 1 a8.5 8.5 0 0 1 3 16 z" fill="#F3EEE8" stroke="#B9AFA4" strokeWidth={2} strokeLinejoin="round" /></Svg>
        </Animated.View>
      )}
      {L.question && (
        <Text style={{ position: 'absolute', right: size * 0.12, top: size * 0.08, fontFamily: F.semi, fontSize: size * 0.22, color: '#A99A85' }}>?</Text>
      )}
    </>
  );
}
```

- [ ] **Step 6: Dev gallery**

`apps/mobile/app/dev/sunny.tsx`:

```tsx
import { ScrollView, Text, View } from 'react-native';
import { Sunny } from '../../src/sunny/Sunny';
import type { SunnyFace } from '../../src/sunny/look';
import { C, F } from '../../src/theme';

const FACES: SunnyFace[] = ['glowing', 'happy', 'alright', 'fading', 'sad', 'unknown'];

export default function SunnyGallery() {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, gap: 18 }}>
      {FACES.map((f) => (
        <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Sunny face={f} size={120} />
          <Sunny face={f} size={28} />
          <Text style={{ fontFamily: F.medium, color: C.ink }}>{f}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 7: Check on the emulator**

Reload the app and open `daily://dev/sunny` (`adb shell am start -a android.intent.action.VIEW -d "daily://dev/sunny"`).
Expected: six Sunnys matching the "Sunny: the five moods" board — glowing has sparkles and spinning rays, happy rays turn slowly, alright/fading still, sad has a tear and drifting cloud, unknown shows "?"; all blink and bob; the 28 px versions stay readable. Then turn on Settings → Accessibility → Remove animations on the emulator, reopen the gallery: no motion.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/sunny apps/mobile/app/dev
git commit -m "feat(mobile): animated Sunny buddy with five moods

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Today data

**Files:**
- Create: `apps/mobile/src/today/build.ts`, `src/today/copy.ts`, `src/today/load.ts`
- Test: `apps/mobile/src/today/build.test.ts`, `src/today/copy.test.ts`, `src/today/load.test.ts`

**Interfaces:**
- Consumes: `Category`, `CATEGORIES`, `isCategory`, `moodFor`, `Mood`, `dayStartMs`, `loadState`, `getNumber`, `localDate`, `formatDuration`, `hourLabel`.
- Produces:
  - `type TodayInput = { day: string; nowMs: number; goalMin: number; sessions: { package: string; start_ms: number; end_ms: number }[]; open: { pkg: string; startMs: number } | null; pickups: number[]; apps: { package: string; label: string; category: string; user_category: string | null; icon_png: string | null }[] }`
  - `type TodayApp = { pkg: string; label: string; minutes: number; icon: string | null }`
  - `type TodayCategory = { id: Category; minutes: number; share: number; apps: TodayApp[] }`
  - `type TodayView = { phoneMin: number; pickups: number; firstPickupMs: number | null; categories: TodayCategory[]; timeline: { startH: number; segments: { left: number; width: number; category: Category }[]; nowAt: number | null; ticks: { at: number; label: string }[] }; mood: Mood; goalMin: number; leftMin: number; empty: boolean }`
  - `buildToday(input: TodayInput): TodayView`
  - `greeting(nowMs): string`, `dateLine(nowMs, firstPickupMs): string`, `goalLine(leftMin, goalMin): string`
  - `loadToday(db: Db, nowMs: number): TodayView`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/today/build.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildToday, type TodayInput } from './build';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();
const apps: TodayInput['apps'] = [
  { package: 'com.instagram.android', label: 'Instagram', category: 'social', user_category: null, icon_png: null },
  { package: 'com.whatsapp', label: 'WhatsApp', category: 'messages', user_category: null, icon_png: 'abc' },
  { package: 'com.duolingo', label: 'Duolingo', category: 'learning', user_category: 'fun', icon_png: null }
];
const base: TodayInput = {
  day: '2026-10-06', nowMs: at(21), goalMin: 240, open: null, pickups: [at(7, 12), at(9)], apps,
  sessions: [
    { package: 'com.instagram.android', start_ms: at(12), end_ms: at(13) },
    { package: 'com.whatsapp', start_ms: at(8), end_ms: at(8, 30) },
    { package: 'com.duolingo', start_ms: at(8, 30), end_ms: at(8, 45) }
  ]
};

describe('buildToday', () => {
  it('totals phone time, pickups and the first pickup', () => {
    const v = buildToday(base);
    expect(v.phoneMin).toBe(105);
    expect(v.pickups).toBe(2);
    expect(v.firstPickupMs).toBe(at(7, 12));
    expect(v.empty).toBe(false);
  });

  it('groups by category (user override wins), biggest first, with shares', () => {
    const v = buildToday(base);
    expect(v.categories.map((c) => [c.id, c.minutes])).toEqual([['social', 60], ['messages', 30], ['fun', 15]]);
    expect(v.categories[0].share).toBeCloseTo(60 / 105);
    expect(v.categories[1].apps[0]).toEqual({ pkg: 'com.whatsapp', label: 'WhatsApp', minutes: 30, icon: 'abc' });
  });

  it('counts the open app up to now', () => {
    const v = buildToday({ ...base, open: { pkg: 'com.whatsapp', startMs: at(20, 30) } });
    expect(v.phoneMin).toBe(135);
  });

  it('counts an open app from midnight if it opened yesterday', () => {
    const v = buildToday({ ...base, sessions: [], nowMs: at(0, 20), open: { pkg: 'com.whatsapp', startMs: at(0) - 600_000 } });
    expect(v.phoneMin).toBe(20);
  });

  it('labels an unknown app by package and files it under other (Review Focus 4)', () => {
    const v = buildToday({ ...base, apps: [], sessions: [{ package: 'gone.app', start_ms: at(9), end_ms: at(9, 10) }] });
    expect(v.categories).toEqual([{ id: 'other', minutes: 10, share: 1, apps: [{ pkg: 'gone.app', label: 'gone.app', minutes: 10, icon: null }] }]);
  });

  it('updates the mood and goal left when the goal changes (Review Focus 5)', () => {
    expect(buildToday(base).mood).toBe('glowing'); // 105 of 240
    const tight = buildToday({ ...base, goalMin: 90 });
    expect(tight.mood).toBe('fading');             // 105 of 90
    expect(tight.leftMin).toBe(-15);
  });

  it('builds a timeline from 7 am (or earlier use) to midnight', () => {
    const v = buildToday(base);
    expect(v.timeline.startH).toBe(7);
    expect(v.timeline.ticks.map((t) => t.label)).toEqual(['7 am', '11 am', '3 pm', '7 pm', '11 pm']);
    const insta = v.timeline.segments.find((s) => s.category === 'social')!;
    expect(insta.left).toBeCloseTo(((12 - 7) / 17) * 100);
    expect(insta.width).toBeCloseTo((1 / 17) * 100);
    expect(v.timeline.nowAt).toBeCloseTo(((21 - 7) / 17) * 100);
    const early = buildToday({ ...base, sessions: [{ package: 'com.whatsapp', start_ms: at(5, 40), end_ms: at(6) }] });
    expect(early.timeline.startH).toBe(5);
  });

  it('marks an empty day (Review Focus 3)', () => {
    const v = buildToday({ ...base, sessions: [], pickups: [] });
    expect(v.empty).toBe(true);
    expect(v.categories).toEqual([]);
    expect(v.mood).toBe('glowing');
  });
});
```

`apps/mobile/src/today/copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dateLine, goalLine, greeting } from './copy';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();

describe('copy', () => {
  it('greets by time of day', () => {
    expect(greeting(at(6))).toBe('Good morning');
    expect(greeting(at(13))).toBe('Good afternoon');
    expect(greeting(at(21))).toBe('Good evening');
    expect(greeting(at(2))).toBe('Good evening');
  });

  it('writes the date line with the first pickup when there is one', () => {
    expect(dateLine(at(21), at(7, 12))).toBe('Tue 6 Oct · first pickup 7:12 am');
    expect(dateLine(at(21), null)).toBe('Tue 6 Oct');
  });

  it('says time left or over the goal', () => {
    expect(goalLine(48, 240)).toBe('48m left before your 4h goal');
    expect(goalLine(0, 240)).toBe('You’ve reached your 4h goal');
    expect(goalLine(-62, 240)).toBe('1h 2m over your 4h goal');
  });
});
```

`apps/mobile/src/today/load.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { setSetting } from '../db/settings';
import { loadToday } from './load';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime();

describe('loadToday', () => {
  it('reads today’s rows, the open app and the goal from the database', async () => {
    const db = await makeTestDb();
    setSetting(db, 'goal_min', 60);
    db.run("INSERT INTO apps (package, label, category) VALUES ('com.whatsapp', 'WhatsApp', 'messages')");
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.whatsapp', ?, ?, '2026-10-06')", [at(9), at(9, 30)]);
    db.run("INSERT INTO sessions (package, start_ms, end_ms, day) VALUES ('com.whatsapp', ?, ?, '2026-10-05')", [at(9) - 86_400_000, at(10) - 86_400_000]);
    db.run('INSERT INTO pickups (ts_ms, day) VALUES (?, ?)', [at(8), '2026-10-06']);
    db.run('INSERT INTO ingest_state (id, last_event_ms, open_pkg, open_start_ms) VALUES (1, ?, ?, ?)', [at(10), 'com.whatsapp', at(10)]);
    const v = loadToday(db, at(10, 15));
    expect(v.phoneMin).toBe(45);
    expect(v.pickups).toBe(1);
    expect(v.goalMin).toBe(60);
    expect(v.mood).toBe('happy'); // 45 of 60 = 0.75
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./build`, `./copy`, `./load`.

- [ ] **Step 3: Implement**

`apps/mobile/src/today/build.ts`:

```ts
import { isCategory, type Category } from '../tracking/categories';
import { dayStartMs } from '../tracking/ingest';
import { moodFor, type Mood } from '../sunny/mood';
import { hourLabel } from '../format';

export type TodayInput = {
  day: string; nowMs: number; goalMin: number;
  sessions: { package: string; start_ms: number; end_ms: number }[];
  open: { pkg: string; startMs: number } | null;
  pickups: number[];
  apps: { package: string; label: string; category: string; user_category: string | null; icon_png: string | null }[];
};
export type TodayApp = { pkg: string; label: string; minutes: number; icon: string | null };
export type TodayCategory = { id: Category; minutes: number; share: number; apps: TodayApp[] };
export type TodayView = {
  phoneMin: number; pickups: number; firstPickupMs: number | null;
  categories: TodayCategory[];
  timeline: { startH: number; segments: { left: number; width: number; category: Category }[]; nowAt: number | null; ticks: { at: number; label: string }[] };
  mood: Mood; goalMin: number; leftMin: number; empty: boolean;
};

const MIN = 60_000;
const HOUR = 3_600_000;

export function buildToday(input: TodayInput): TodayView {
  const dayStart = dayStartMs(input.day);
  const dayEnd = dayStart + 24 * HOUR;
  const spans = input.sessions.map((s) => ({ pkg: s.package, start: s.start_ms, end: s.end_ms }));
  if (input.open) {
    const start = Math.max(input.open.startMs, dayStart);
    const end = Math.min(input.nowMs, dayEnd);
    if (end > start) spans.push({ pkg: input.open.pkg, start, end });
  }

  const meta = new Map(input.apps.map((a) => [a.package, a]));
  const categoryOf = (pkg: string): Category => {
    const a = meta.get(pkg);
    if (!a) return 'other';
    if (isCategory(a.user_category)) return a.user_category;
    return isCategory(a.category) ? a.category : 'other';
  };

  const perApp = new Map<string, number>();
  for (const s of spans) perApp.set(s.pkg, (perApp.get(s.pkg) ?? 0) + (s.end - s.start) / MIN);
  const phoneMin = [...perApp.values()].reduce((a, b) => a + b, 0);

  const groups = new Map<Category, TodayApp[]>();
  for (const [pkg, minutes] of perApp) {
    const id = categoryOf(pkg);
    const a = meta.get(pkg);
    groups.set(id, [...(groups.get(id) ?? []), { pkg, label: a?.label ?? pkg, minutes, icon: a?.icon_png ?? null }]);
  }
  const categories: TodayCategory[] = [...groups].map(([id, list]) => {
    const minutes = list.reduce((a, b) => a + b.minutes, 0);
    return { id, minutes, share: phoneMin > 0 ? minutes / phoneMin : 0, apps: list.sort((a, b) => b.minutes - a.minutes) };
  }).sort((a, b) => b.minutes - a.minutes);

  const firstHour = spans.length ? Math.floor((Math.min(...spans.map((s) => s.start)) - dayStart) / HOUR) : 7;
  const startH = Math.min(7, firstHour);
  const span = 24 - startH;
  const pct = (ms: number) => ((ms - dayStart) / HOUR - startH) / span * 100;
  const segments = spans.map((s) => ({ left: pct(s.start), width: ((s.end - s.start) / HOUR / span) * 100, category: categoryOf(s.pkg) }));
  const ticks: { at: number; label: string }[] = [];
  for (let h = startH; h < 24; h += 4) ticks.push({ at: ((h - startH) / span) * 100, label: hourLabel(h) });
  const nowAt = input.nowMs >= dayStart && input.nowMs < dayEnd ? pct(input.nowMs) : null;

  const pickups = [...input.pickups].sort((a, b) => a - b);
  return {
    phoneMin,
    pickups: pickups.length,
    firstPickupMs: pickups[0] ?? null,
    categories,
    timeline: { startH, segments, nowAt, ticks },
    mood: moodFor(phoneMin, input.goalMin),
    goalMin: input.goalMin,
    leftMin: input.goalMin - phoneMin,
    empty: spans.length === 0
  };
}
```

`apps/mobile/src/today/copy.ts`:

```ts
import { formatDuration } from '../format';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function greeting(nowMs: number): string {
  const h = new Date(nowMs).getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

function clock(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

export function dateLine(nowMs: number, firstPickupMs: number | null): string {
  const d = new Date(nowMs);
  const date = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return firstPickupMs === null ? date : `${date} · first pickup ${clock(firstPickupMs)}`;
}

export function goalLine(leftMin: number, goalMin: number): string {
  const goal = formatDuration(goalMin);
  if (Math.round(leftMin) > 0) return `${formatDuration(leftMin)} left before your ${goal} goal`;
  if (Math.round(leftMin) === 0) return `You’ve reached your ${goal} goal`;
  return `${formatDuration(-leftMin)} over your ${goal} goal`;
}
```

`apps/mobile/src/today/load.ts`:

```ts
import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { getNumber } from '../db/settings';
import { loadState } from '../tracking/sync';
import { buildToday, type TodayInput, type TodayView } from './build';

export function loadToday(db: Db, nowMs: number): TodayView {
  const day = localDate(nowMs);
  const state = loadState(db);
  return buildToday({
    day,
    nowMs,
    goalMin: getNumber(db, 'goal_min'),
    sessions: db.all<TodayInput['sessions'][number]>('SELECT package, start_ms, end_ms FROM sessions WHERE day = ?', [day]),
    open: state.openPkg !== null && state.openStartMs !== null ? { pkg: state.openPkg, startMs: state.openStartMs } : null,
    pickups: db.all<{ ts_ms: number }>('SELECT ts_ms FROM pickups WHERE day = ?', [day]).map((r) => r.ts_ms),
    apps: db.all<TodayInput['apps'][number]>('SELECT package, label, category, user_category, icon_png FROM apps')
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/today
git commit -m "feat(mobile): Today view builder, copy and loader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Today screen

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`
- Create: `apps/mobile/src/today/useToday.ts`, `src/today/CategoryCard.tsx`, `src/today/SunnyCard.tsx`, `src/today/Timeline.tsx`

**Interfaces:**
- Consumes: `runSync`, `getDb`, `loadToday`, `TodayView`, `TodayCategory`, `CATEGORY_LOOK`, `Category`, `Sunny`, `MOOD_COPY`, `moodIndex`, `MOODS`, `LOOK`, `greeting`, `dateLine`, `goalLine`, `formatDuration`, `Icon`, `Logo`, `rise`, `C`, `F`, `DailyNative.hasUsageAccess/openUsageAccessSettings`.
- Produces: `useToday(): { view: TodayView | null; access: boolean; refresh: () => Promise<void> }` (refreshes on focus, when the app returns to the foreground, and every 60 s while visible).

- [ ] **Step 1: Data hook**

`apps/mobile/src/today/useToday.ts`:

```ts
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import DailyNative from '../../modules/daily-native';
import { getDb } from '../db/expoDb';
import { runSync } from '../tracking/runSync';
import { loadToday } from './load';
import type { TodayView } from './build';

export function useToday() {
  const [view, setView] = useState<TodayView | null>(null);
  const [access, setAccess] = useState(true);

  const refresh = useCallback(async () => {
    const result = await runSync().catch(() => 'ok' as const); // a failed sync still shows what's stored
    setAccess(result !== 'no_access' && DailyNative.hasUsageAccess());
    setView(loadToday(getDb(), Date.now()));
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [refresh]));

  return { view, access, refresh };
}
```

- [ ] **Step 2: Category card**

`apps/mobile/src/today/CategoryCard.tsx`:

```tsx
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { formatDuration } from '../format';
import { C, F } from '../theme';
import { CATEGORY_LOOK } from '../tracking/categories';
import { Icon } from '../ui/icons';
import { rise } from '../ui/motion';
import type { TodayCategory } from './build';

export function CategoryCard({ cat, index }: { cat: TodayCategory; index: number }) {
  const look = CATEGORY_LOOK[cat.id];
  const top = cat.apps.slice(0, 2);
  return (
    <Animated.View entering={rise(5 + index)} style={[s.card, { backgroundColor: look.color }]}>
      <View style={s.top}>
        <View style={s.ico}><Icon name={cat.id} size={15} /></View>
        <Text style={s.small}>{look.label}</Text>
        <Text style={s.chip}>{formatDuration(cat.minutes)}</Text>
      </View>
      <Text style={s.title} numberOfLines={2}>{top.map((a) => a.label).join(' & ')}</Text>
      <View style={s.foot}>
        <Text style={s.share}>{Math.round(cat.share * 100)}% of today</Text>
        <View style={{ flexDirection: 'row' }}>
          {top.map((a, i) => (
            <View key={a.pkg} style={[s.badge, { marginLeft: i === 0 ? 0 : -6 }]}>
              {a.icon
                ? <Image source={{ uri: `data:image/png;base64,${a.icon}` }} style={{ width: 16, height: 16 }} accessibilityIgnoresInvertColors />
                : <Text style={s.badgeText}>{a.label.charAt(0).toUpperCase()}</Text>}
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: { width: '48.5%', borderRadius: 22, padding: 14, minHeight: 132 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ico: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  small: { fontFamily: F.regular, fontSize: 12, color: C.ink },
  chip: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, fontFamily: F.semi, fontSize: 12, color: C.ink, overflow: 'hidden' },
  title: { fontFamily: F.medium, fontSize: 16, lineHeight: 20, color: C.ink, marginTop: 'auto', paddingTop: 12 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 },
  share: { fontFamily: F.regular, fontSize: 11, color: 'rgba(0,0,0,0.62)' },
  badge: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badgeText: { fontFamily: F.semi, fontSize: 9, color: C.ink }
});
```

- [ ] **Step 3: Sunny card and timeline**

`apps/mobile/src/today/SunnyCard.tsx`:

```tsx
import { Text, View } from 'react-native';
import { LOOK } from '../sunny/look';
import { MOOD_COPY, MOODS, moodIndex } from '../sunny/mood';
import { Sunny } from '../sunny/Sunny';
import { C, F } from '../theme';
import type { TodayView } from './build';
import { goalLine } from './copy';

export function SunnyCard({ view, access }: { view: TodayView; access: boolean }) {
  const current = moodIndex(view.mood);
  return (
    <View style={{ backgroundColor: C.white, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Sunny face={access ? view.mood : 'unknown'} size={76} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.ink }}>{access ? MOOD_COPY[view.mood].title : "Sunny can't see your day yet"}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 12, lineHeight: 17, color: C.muted, marginTop: 3 }}>
          {access ? `${goalLine(view.leftMin, view.goalMin)} · ${view.pickups} pickups` : 'Turn on usage access so he can.'}
        </Text>
        {access && (
          <View accessible accessibilityLabel={`Mood ${current + 1} of 5`} style={{ flexDirection: 'row', gap: 4, marginTop: 9 }}>
            {MOODS.map((m, i) => (
              <View key={m} style={{ flex: 1, height: 6, borderRadius: 9, backgroundColor: LOOK[m].body, opacity: i === current ? 1 : 0.35 }} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
```

`apps/mobile/src/today/Timeline.tsx`:

```tsx
import { Text, View } from 'react-native';
import { C, F } from '../theme';
import { CATEGORY_LOOK } from '../tracking/categories';
import type { TodayView } from './build';

export function Timeline({ view }: { view: TodayView }) {
  const t = view.timeline;
  return (
    <View style={{ backgroundColor: C.white, borderRadius: 18, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
      <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted, marginBottom: 8 }}>Today</Text>
      <View style={{ height: 26, borderRadius: 9, backgroundColor: '#F5F1EC', overflow: 'hidden' }}>
        {t.segments.map((seg, i) => (
          <View key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${seg.left}%`, width: `${Math.max(seg.width, 0.4)}%`, backgroundColor: CATEGORY_LOOK[seg.category].color }} />
        ))}
        {t.nowAt !== null && <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${t.nowAt}%`, width: 2, backgroundColor: C.ink }} />}
      </View>
      <View style={{ height: 16, marginTop: 6 }}>
        {t.ticks.map((tick) => (
          <Text key={tick.label} style={{ position: 'absolute', left: `${tick.at}%`, fontFamily: F.regular, fontSize: 11, color: C.muted }}>{tick.label}</Text>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: The screen**

`apps/mobile/app/(tabs)/index.tsx`:

```tsx
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DailyNative from '../../modules/daily-native';
import { formatDuration } from '../../src/format';
import { C, F } from '../../src/theme';
import { CategoryCard } from '../../src/today/CategoryCard';
import { dateLine, greeting } from '../../src/today/copy';
import { SunnyCard } from '../../src/today/SunnyCard';
import { Timeline } from '../../src/today/Timeline';
import { useToday } from '../../src/today/useToday';
import { CATEGORY_LOOK, type Category } from '../../src/tracking/categories';
import { Icon } from '../../src/ui/icons';
import { Logo } from '../../src/ui/Logo';
import { rise } from '../../src/ui/motion';

export default function Today() {
  const insets = useSafeAreaInsets();
  const { view, access } = useToday();
  const [filter, setFilter] = useState<Category | 'all'>('all');
  if (!view) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const shown = filter === 'all' ? view.categories : view.categories.filter((c) => c.id === filter);
  const now = Date.now();

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 24 }}>
      <Animated.View entering={rise(0)} style={s.header}>
        <Logo size={30} />
        <Text style={s.brand}>Daily</Text>
        <View style={s.status}>
          <View style={[s.dot, !access && { backgroundColor: '#C9C2BB' }]} />
          <Text style={s.statusText}>{access ? 'Tracking' : 'Paused'}</Text>
        </View>
        <Link href="/settings" asChild>
          <Pressable accessibilityLabel="Settings" style={s.round}><Icon name="gear" size={19} /></Pressable>
        </Link>
      </Animated.View>

      <Animated.Text entering={rise(1)} style={s.date}>{greeting(now)} · {dateLine(now, view.firstPickupMs)}</Animated.Text>
      <Animated.Text entering={rise(2)} style={s.headline}>
        You spent <Text style={{ fontFamily: F.semi }}>{formatDuration(view.phoneMin)}</Text> on your phone today
      </Animated.Text>

      {!access && (
        <Animated.View entering={rise(3)} style={s.banner}>
          <Text style={s.bannerTitle}>Turn on usage access</Text>
          <Text style={s.bannerBody}>Daily needs it to see which apps you use. Only app names and minutes, kept on this phone.</Text>
          <Pressable onPress={() => DailyNative.openUsageAccessSettings()} style={s.bannerBtn}><Text style={s.bannerBtnText}>Open settings</Text></Pressable>
        </Animated.View>
      )}

      {view.categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginBottom: 20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {(['all', ...view.categories.map((c) => c.id)] as const).map((id, i) => {
            const on = filter === id;
            return (
              <Animated.View key={id} entering={rise(3 + i)}>
                <Pressable onPress={() => setFilter(id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.pill, on && { backgroundColor: C.ink }]}>
                  <View style={[s.pillIco, on && { backgroundColor: C.white, borderWidth: 0 }]}><Icon name={id === 'all' ? 'grid' : id} size={15} /></View>
                  <Text style={[s.pillText, on && { color: C.white }]}>{id === 'all' ? 'All' : CATEGORY_LOOK[id].label}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {view.empty && access ? (
        <Animated.View entering={rise(4)} style={s.empty}><Text style={s.emptyText}>Nothing yet today. Sunny's ready when you are.</Text></Animated.View>
      ) : (
        <>
          {shown.length > 0 && <Text style={s.sec}>Where your time went</Text>}
          <View style={s.grid}>{shown.map((c, i) => <CategoryCard key={c.id} cat={c} index={i} />)}</View>
          {filter !== 'all' && shown[0] && (
            <View style={s.list}>
              {shown[0].apps.map((a) => (
                <View key={a.pkg} style={s.row}><Text style={s.rowLabel}>{a.label}</Text><Text style={s.rowMin}>{formatDuration(a.minutes)}</Text></View>
              ))}
            </View>
          )}
        </>
      )}

      <Animated.View entering={rise(9)} style={s.panel}>
        <SunnyCard view={view} access={access} />
        <Timeline view={view} />
      </Animated.View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44 },
  brand: { fontFamily: F.semi, fontSize: 16, color: C.ink },
  status: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ok },
  statusText: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  date: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 14, marginBottom: 6 },
  headline: { fontFamily: F.regular, fontSize: 38, lineHeight: 40, letterSpacing: -0.9, color: C.ink, marginBottom: 18 },
  banner: { backgroundColor: C.white, borderRadius: 20, padding: 16, gap: 8, marginBottom: 18 },
  bannerTitle: { fontFamily: F.semi, fontSize: 16, color: C.ink },
  bannerBody: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.body },
  bannerBtn: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.ink, justifyContent: 'center' },
  bannerBtnText: { fontFamily: F.semi, fontSize: 14, color: C.white },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingLeft: 5, paddingRight: 16, borderRadius: 999, backgroundColor: C.white, minHeight: 44 },
  pillIco: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: F.medium, fontSize: 13, color: C.ink },
  sec: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginBottom: 14 },
  list: { backgroundColor: C.white, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, alignItems: 'center' },
  rowLabel: { fontFamily: F.regular, fontSize: 14, color: C.ink },
  rowMin: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  empty: { backgroundColor: C.white, borderRadius: 22, padding: 24, marginBottom: 14 },
  emptyText: { fontFamily: F.regular, fontSize: 14, color: C.muted },
  panel: { backgroundColor: C.panel, borderRadius: 22, padding: 10, gap: 10 }
});
```

- [ ] **Step 5: Check on the emulator**

Run: `pnpm --filter @worksight/mobile android`. With access revoked (`adb shell appops set com.aaronalex.daily GET_USAGE_STATS ignore`): banner shows, Sunny shows "?", "Paused" in the header, no crash. Grant access (`... allow`), use Chrome and YouTube for a few minutes, return to Daily.
Expected: headline time rises; cards for the used categories in their colours; tapping a pill filters and lists apps; Sunny card shows a mood + "…left before your 4h goal · N pickups"; timeline has coloured segments and a black "now" line; blocks rise in staggered on open. Leave Daily open for 2 minutes while a video plays in split screen or after switching back — time updates within 60 s.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`
Expected: no errors, all tests pass.

```bash
git add apps/mobile
git commit -m "feat(mobile): Today screen with categories, Sunny card and timeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Onboarding

**Files:**
- Create: `apps/mobile/app/onboarding.tsx`, `apps/mobile/src/ui/GoalStepper.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (redirect until onboarded)

**Interfaces:**
- Consumes: `getDb`, `getSetting`, `setSetting`, `getNumber`, `DailyNative.hasUsageAccess/openUsageAccessSettings`, `Sunny`, `Logo`, `rise`, `formatDuration`.
- Produces: `<GoalStepper value: number; onChange(min: number) />` (60–720, steps of 30); setting `onboarded = '1'` after the last step.

- [ ] **Step 1: Goal stepper**

`apps/mobile/src/ui/GoalStepper.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { formatDuration } from '../format';
import { C, F } from '../theme';
import { Icon } from './icons';

export const GOAL_MIN = 60;
export const GOAL_MAX = 720;

export function GoalStepper({ value, onChange }: { value: number; onChange: (min: number) => void }) {
  const step = (d: number) => onChange(Math.min(GOAL_MAX, Math.max(GOAL_MIN, value + d)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Pressable onPress={() => step(-30)} disabled={value <= GOAL_MIN} accessibilityLabel="Less" style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', opacity: value <= GOAL_MIN ? 0.4 : 1 }}>
        <Icon name="minus" size={20} />
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.semi, fontSize: 34, color: C.ink, minWidth: 110, textAlign: 'center' }}>{formatDuration(value)}</Text>
      <Pressable onPress={() => step(30)} disabled={value >= GOAL_MAX} accessibilityLabel="More" style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', opacity: value >= GOAL_MAX ? 0.4 : 1 }}>
        <Icon name="plus" size={20} />
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Onboarding screen** (3 steps; M2/M3 add notifications and the Sunny service as step 4)

`apps/mobile/app/onboarding.tsx`:

```tsx
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DailyNative from '../modules/daily-native';
import { getDb } from '../src/db/expoDb';
import { getNumber, setSetting } from '../src/db/settings';
import { Sunny } from '../src/sunny/Sunny';
import { C, F } from '../src/theme';
import { GoalStepper } from '../src/ui/GoalStepper';
import { Icon } from '../src/ui/icons';
import { rise } from '../src/ui/motion';

const STEPS = 3;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(() => getNumber(getDb(), 'goal_min'));

  // Coming back from Android Settings with access granted moves on by itself.
  useEffect(() => {
    if (step !== 1) return;
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && DailyNative.hasUsageAccess()) setStep(2); });
    return () => sub.remove();
  }, [step]);

  const finish = () => {
    const db = getDb();
    setSetting(db, 'goal_min', goal);
    setSetting(db, 'onboarded', '1');
    router.replace('/');
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <View style={s.steps}>
        {Array.from({ length: STEPS }, (_, i) => <View key={i} style={[s.bar, i === step && { backgroundColor: C.ink }]} />)}
        <Text style={s.stepText}>Step {step + 1} of {STEPS}</Text>
      </View>

      <Animated.View key={step} entering={rise(0)} style={{ flex: 1 }}>
        {step === 0 && (
          <View style={s.body}>
            <View style={s.hero}><Sunny face="glowing" size={170} /></View>
            <Text style={s.h1}>Meet Sunny</Text>
            <Text style={s.p}>Sunny glows when your phone time stays low and dims as it climbs past your goal. Daily keeps everything on this phone.</Text>
          </View>
        )}
        {step === 1 && (
          <View style={s.body}>
            <View style={[s.hero, { backgroundColor: '#D8D2FC' }]}><Sunny face="happy" size={120} /></View>
            <Text style={s.h1}>Let Daily see which apps you use</Text>
            <Text style={s.p}>Android asks once. Turn on Daily on the next screen, then come back.</Text>
            <View style={s.point}><View style={s.pointIco}><Icon name="lock" size={15} /></View><Text style={s.pointText}>Stays on this phone. No account, no cloud copy.</Text></View>
            <View style={s.point}><View style={s.pointIco}><Icon name="eyeOff" size={15} /></View><Text style={s.pointText}>Only app names and minutes. Never your messages, photos or screen.</Text></View>
          </View>
        )}
        {step === 2 && (
          <View style={s.body}>
            <Text style={s.h1}>Pick a daily phone goal</Text>
            <Text style={s.p}>Sunny stays happy under half of it and starts to fade once you pass it. You can change it any time.</Text>
            <View style={{ alignItems: 'center', marginTop: 28 }}><GoalStepper value={goal} onChange={setGoal} /></View>
          </View>
        )}
      </Animated.View>

      <View style={{ gap: 8 }}>
        {step === 0 && <Primary label="Get started" onPress={() => setStep(1)} />}
        {step === 1 && (
          <>
            <Primary label="Open settings" onPress={() => DailyNative.openUsageAccessSettings()} />
            <Pressable onPress={() => setStep(2)} style={s.secondary}><Text style={s.secondaryText}>Not now, just reminders</Text></Pressable>
          </>
        )}
        {step === 2 && <Primary label="Start Daily" onPress={finish} />}
      </View>
    </View>
  );
}

function Primary({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={s.primary}><Text style={s.primaryText}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { width: 22, height: 6, borderRadius: 9, backgroundColor: '#D8CFC7' },
  stepText: { marginLeft: 'auto', fontFamily: F.regular, fontSize: 12, color: C.muted },
  body: { flex: 1, paddingTop: 28 },
  hero: { backgroundColor: '#FFEFD4', borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingVertical: 26, marginBottom: 22 },
  h1: { fontFamily: F.medium, fontSize: 30, lineHeight: 33, letterSpacing: -0.6, color: C.ink, marginBottom: 10 },
  p: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.body, marginBottom: 16 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  pointIco: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.ink },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: F.medium, fontSize: 14, color: C.body }
});
```

- [ ] **Step 3: Redirect until onboarded**

In `apps/mobile/app/_layout.tsx`, add `Redirect`/`useSegments` handling. Replace the final `return <Stack … />` with:

```tsx
  return <Gate />;
}

function Gate() {
  const segments = useSegments();
  const onboarded = getSetting(getDb(), 'onboarded') === '1';
  if (!onboarded && segments[0] !== 'onboarding') return <Redirect href="/onboarding" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
```

and add the imports `import { Redirect, Stack, useSegments } from 'expo-router';` and `import { getSetting } from '../src/db/settings';`.

(The `Redirect` render path never mounts the Stack, so the check reruns when `router.replace('/')` moves away from onboarding after `onboarded` is set.)

- [ ] **Step 4: Check on the emulator**

Clear app data (`adb shell pm clear com.aaronalex.daily`), launch.
Expected: onboarding step 1 with a glowing Sunny → "Get started" → step 2 → "Open settings" opens Android's Usage access list; enable Daily, press back → onboarding moves to step 3 by itself → set goal 3h → "Start Daily" → Today. Relaunching goes straight to Today. Repeat with "Not now, just reminders" → Today shows the usage-access banner.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @worksight/mobile typecheck`
Expected: no errors.

```bash
git add apps/mobile
git commit -m "feat(mobile): onboarding with usage access and goal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Settings

**Files:**
- Create: `apps/mobile/src/settings/data.ts`, `apps/mobile/app/settings/index.tsx`, `apps/mobile/app/settings/categories.tsx`
- Test: `apps/mobile/src/settings/data.test.ts`

**Interfaces:**
- Consumes: `Db`, `setSetting`, `getNumber`, `Category`, `CATEGORIES`, `CATEGORY_LOOK`, `isCategory`, `localDate`, `GoalStepper`.
- Produces:
  - `exportJson(db: Db): string` (all tables except app icons; pretty JSON with `exportedAt`)
  - `deleteEverything(db: Db): void` (empties every table, so onboarding runs again)
  - `setUserCategory(db: Db, pkg: string, cat: Category | null): void`
  - `appsForSettings(db: Db): { package: string; label: string; category: Category; overridden: boolean }[]` (sorted by label)
  - `seedSampleDay(db: Db, nowMs: number): void` (dev only)
  - `RETENTION_CHOICES = [30, 90, 180, 365]`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/settings/data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../db/testDb';
import { getSetting, setSetting } from '../db/settings';
import { loadToday } from '../today/load';
import { appsForSettings, deleteEverything, exportJson, seedSampleDay, setUserCategory } from './data';

const now = new Date(2026, 9, 6, 21).getTime();

describe('settings data', () => {
  it('exports every table but leaves out icons', async () => {
    const db = await makeTestDb();
    db.run("INSERT INTO apps (package, label, category, icon_png) VALUES ('com.a', 'A', 'fun', 'BIGICON')");
    setSetting(db, 'goal_min', 180);
    const out = JSON.parse(exportJson(db));
    expect(Object.keys(out).sort()).toEqual(['apps', 'exportedAt', 'mood_log', 'pickups', 'sessions', 'settings']);
    expect(out.apps[0]).toEqual({ package: 'com.a', label: 'A', category: 'fun', user_category: null });
    expect(out.settings).toEqual([{ key: 'goal_min', value: '180' }]);
  });

  it('deletes everything and resets onboarding', async () => {
    const db = await makeTestDb();
    seedSampleDay(db, now);
    setSetting(db, 'onboarded', '1');
    deleteEverything(db);
    for (const t of ['sessions', 'pickups', 'apps', 'ingest_state', 'mood_log', 'settings']) expect(db.all(`SELECT * FROM ${t}`)).toEqual([]);
    expect(getSetting(db, 'onboarded')).toBe('0');
  });

  it('overrides and resets an app category', async () => {
    const db = await makeTestDb();
    db.run("INSERT INTO apps (package, label, category) VALUES ('com.b', 'Bee', 'social'), ('com.a', 'Ant', 'fun')");
    setUserCategory(db, 'com.b', 'work');
    expect(appsForSettings(db)).toEqual([
      { package: 'com.a', label: 'Ant', category: 'fun', overridden: false },
      { package: 'com.b', label: 'Bee', category: 'work', overridden: true }
    ]);
    setUserCategory(db, 'com.b', null);
    expect(appsForSettings(db)[1]).toEqual({ package: 'com.b', label: 'Bee', category: 'social', overridden: false });
  });

  it('seeds a believable day that Today can show', async () => {
    const db = await makeTestDb();
    seedSampleDay(db, now);
    const v = loadToday(db, now);
    expect(v.phoneMin).toBeGreaterThan(120);
    expect(v.categories.length).toBeGreaterThanOrEqual(4);
    expect(v.pickups).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @worksight/mobile test`
Expected: FAIL — cannot find `./data`.

- [ ] **Step 3: Implement**

`apps/mobile/src/settings/data.ts`:

```ts
import { localDate } from '@worksight/core/date';
import type { Db } from '../db/db';
import { isCategory, type Category } from '../tracking/categories';

export const RETENTION_CHOICES = [30, 90, 180, 365] as const;

export function exportJson(db: Db): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    sessions: db.all('SELECT package, start_ms, end_ms, day FROM sessions ORDER BY start_ms'),
    pickups: db.all('SELECT ts_ms, day FROM pickups ORDER BY ts_ms'),
    apps: db.all('SELECT package, label, category, user_category FROM apps ORDER BY package'),
    mood_log: db.all('SELECT day, ts_ms, mood FROM mood_log ORDER BY ts_ms'),
    settings: db.all('SELECT key, value FROM settings ORDER BY key')
  }, null, 2);
}

export function deleteEverything(db: Db): void {
  db.tx(() => {
    for (const t of ['sessions', 'pickups', 'apps', 'ingest_state', 'mood_log', 'settings']) db.run(`DELETE FROM ${t}`);
  });
}

export function setUserCategory(db: Db, pkg: string, cat: Category | null): void {
  db.run('UPDATE apps SET user_category = ? WHERE package = ?', [cat, pkg]);
}

export function appsForSettings(db: Db) {
  return db.all<{ package: string; label: string; category: string; user_category: string | null }>(
    'SELECT package, label, category, user_category FROM apps ORDER BY label COLLATE NOCASE'
  ).map((a) => ({
    package: a.package,
    label: a.label,
    category: (isCategory(a.user_category) ? a.user_category : isCategory(a.category) ? a.category : 'other') as Category,
    overridden: isCategory(a.user_category)
  }));
}

const SAMPLE: [pkg: string, label: string, cat: Category, startH: number, minutes: number][] = [
  ['com.duolingo', 'Duolingo', 'learning', 7.3, 21],
  ['com.whatsapp', 'WhatsApp', 'messages', 8.2, 24],
  ['com.google.android.gm', 'Gmail', 'messages', 9.6, 12],
  ['com.instagram.android', 'Instagram', 'social', 12.4, 42],
  ['com.reddit.frontpage', 'Reddit', 'social', 14.1, 26],
  ['com.whatsapp', 'WhatsApp', 'messages', 16.5, 16],
  ['com.google.android.youtube', 'YouTube', 'fun', 18.2, 33],
  ['com.spotify.music', 'Spotify', 'fun', 19.4, 8],
  ['com.instagram.android', 'Instagram', 'social', 20.1, 10]
];

/** Dev only: a realistic day for UI work on an emulator with no history. */
export function seedSampleDay(db: Db, nowMs: number): void {
  const day = localDate(nowMs);
  const [y, m, d] = day.split('-').map(Number);
  const startOf = (h: number) => new Date(y, m - 1, d).getTime() + Math.round(h * 3_600_000);
  db.tx(() => {
    for (const [pkg, label, cat, h, min] of SAMPLE) {
      const start = startOf(h);
      if (start > nowMs) continue;
      db.run('INSERT OR IGNORE INTO apps (package, label, category) VALUES (?, ?, ?)', [pkg, label, cat]);
      db.run('INSERT OR IGNORE INTO sessions (package, start_ms, end_ms, day) VALUES (?, ?, ?, ?)', [pkg, start, Math.min(nowMs, start + min * 60_000), day]);
    }
    for (let i = 0; i < 46; i++) {
      const t = startOf(7.2 + i * 0.3);
      if (t <= nowMs) db.run('INSERT OR IGNORE INTO pickups (ts_ms, day) VALUES (?, ?)', [t, day]);
    }
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @worksight/mobile test`
Expected: all pass.

- [ ] **Step 5: Settings screens**

`apps/mobile/app/settings/index.tsx`:

```tsx
import { File, Paths } from 'expo-file-system';
import { Link, router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDb } from '../../src/db/expoDb';
import { getNumber, setSetting } from '../../src/db/settings';
import { deleteEverything, exportJson, RETENTION_CHOICES, seedSampleDay } from '../../src/settings/data';
import { Sunny } from '../../src/sunny/Sunny';
import { C, F } from '../../src/theme';
import { GoalStepper } from '../../src/ui/GoalStepper';
import { Icon } from '../../src/ui/icons';
import { rise } from '../../src/ui/motion';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const db = getDb();
  const [goal, setGoal] = useState(() => getNumber(db, 'goal_min'));
  const [retention, setRetention] = useState(() => getNumber(db, 'retention_days'));

  const changeGoal = (min: number) => { setGoal(min); setSetting(db, 'goal_min', min); };
  const cycleRetention = () => {
    const next = RETENTION_CHOICES[(RETENTION_CHOICES.indexOf(retention as (typeof RETENTION_CHOICES)[number]) + 1) % RETENTION_CHOICES.length];
    setRetention(next);
    setSetting(db, 'retention_days', next);
  };
  const exportData = async () => {
    const file = new File(Paths.cache, 'daily-export.json');
    file.write(exportJson(db));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  };
  const confirmDelete = () => Alert.alert('Delete everything?', 'This removes all of Daily’s history from this phone. It can’t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { deleteEverything(db); router.replace('/onboarding'); } }
  ]);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
      <Animated.View entering={rise(0)} style={s.head}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back to Today" style={s.round}><Icon name="back" size={18} /></Pressable>
        <Text style={s.h1}>Settings</Text>
      </Animated.View>

      <Group i={1} label="Goals">
        <View style={s.row}><Sunny face="happy" size={30} /><Text style={s.rowText}>Your buddy</Text><Text style={s.value}>Sunny · more soon</Text></View>
        <View style={[s.row, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 12, gap: 10 }]}>
          <Text style={s.rowText}>Daily phone goal</Text>
          <GoalStepper value={goal} onChange={changeGoal} />
        </View>
      </Group>

      <Group i={2} label="Privacy">
        <Link href="/settings/categories" asChild><Pressable style={s.row}><Text style={s.rowText}>App categories</Text><Text style={s.value}>Edit</Text></Pressable></Link>
        <Pressable onPress={cycleRetention} style={s.row}><Text style={s.rowText}>Keep history for</Text><Text style={s.value}>{retention} days</Text></Pressable>
        <Pressable onPress={exportData} style={s.row}><Text style={s.rowText}>Export my data</Text></Pressable>
        <Pressable onPress={confirmDelete} style={s.row}><Text style={[s.rowText, { color: C.danger }]}>Delete everything</Text></Pressable>
      </Group>

      {__DEV__ && (
        <Group i={3} label="Developer">
          <Pressable onPress={() => { seedSampleDay(db, Date.now()); router.back(); }} style={s.row}><Text style={s.rowText}>Seed a sample day</Text></Pressable>
          <Link href="/dev/sunny" asChild><Pressable style={s.row}><Text style={s.rowText}>Sunny gallery</Text></Pressable></Link>
        </Group>
      )}

      <Text style={s.note}>Everything Daily records stays on this phone: app names, minutes and unlock times. Never notifications, messages or what's on your screen.</Text>
    </ScrollView>
  );
}

function Group({ i, label, children }: { i: number; label: string; children: ReactNode }) {
  return (
    <Animated.View entering={rise(i)}>
      <Text style={s.label}>{label}</Text>
      <View style={s.group}>{children}</View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, marginBottom: 8 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.semi, fontSize: 22, color: C.ink },
  label: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 14, marginBottom: 6, marginLeft: 2 },
  group: { backgroundColor: C.white, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F0E9E3' },
  rowText: { fontFamily: F.regular, fontSize: 14, color: C.ink },
  value: { marginLeft: 'auto', fontFamily: F.regular, fontSize: 13, color: C.muted },
  note: { fontFamily: F.regular, fontSize: 12, lineHeight: 18, color: C.muted, marginTop: 16, marginHorizontal: 2 }
});
```

`apps/mobile/app/settings/categories.tsx`:

```tsx
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDb } from '../../src/db/expoDb';
import { appsForSettings, setUserCategory } from '../../src/settings/data';
import { C, F } from '../../src/theme';
import { CATEGORIES, CATEGORY_LOOK } from '../../src/tracking/categories';
import { Icon } from '../../src/ui/icons';

export default function Categories() {
  const insets = useSafeAreaInsets();
  const db = getDb();
  const [apps, setApps] = useState(() => appsForSettings(db));

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10 }}
      data={apps}
      keyExtractor={(a) => a.package}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, marginBottom: 6 }}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}><Icon name="back" size={18} /></Pressable>
          <Text style={{ fontFamily: F.semi, fontSize: 22, color: C.ink }}>App categories</Text>
        </View>
      }
      ListEmptyComponent={<Text style={{ fontFamily: F.regular, color: C.muted }}>Apps appear here once Daily has seen you use them.</Text>}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: C.white, borderRadius: 18, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink, flex: 1 }}>{item.label}</Text>
            {item.overridden && (
              <Pressable onPress={() => { setUserCategory(db, item.package, null); setApps(appsForSettings(db)); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.muted }}>Reset</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map((c) => {
              const on = item.category === c;
              return (
                <Pressable key={c} onPress={() => { setUserCategory(db, item.package, c); setApps(appsForSettings(db)); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? C.ink : CATEGORY_LOOK[c].color }}>
                  <Text style={{ fontFamily: F.medium, fontSize: 12, color: on ? C.white : C.ink }}>{CATEGORY_LOOK[c].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    />
  );
}
```

- [ ] **Step 6: Check on the emulator**

Settings (gear on Today) → Developer → "Seed a sample day" → Today now shows ~3h of Social/Messages/Fun/Learning cards and Sunny's mood. Change the goal to 2h → back on Today Sunny is sadder immediately. App categories → move Instagram to Work → Today's cards update. "Keep history for" cycles 30/90/180/365. "Export my data" opens the share sheet with `daily-export.json`. "Delete everything" → confirm → onboarding.

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm --filter @worksight/mobile typecheck && pnpm --filter @worksight/mobile test`
Expected: no errors, all tests pass.

```bash
git add apps/mobile
git commit -m "feat(mobile): settings with goal, categories, retention, export and delete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Phase check

**Files:**
- Create: `docs/superpowers/plans/2026-10-06-daily-m1-checklist.md`

- [ ] **Step 1: Full test run**

Close any running Daylens dev window first (it locks `better_sqlite3.node`). Then:

Run: `pnpm test`
Expected: core, agent, consumer and mobile suites all pass. If a desktop suite fails only on `better_sqlite3` ABI, run `pnpm --filter @worksight/consumer pretest` and retry; report anything else.

- [ ] **Step 2: Write the emulator checklist**

`docs/superpowers/plans/2026-10-06-daily-m1-checklist.md`:

```markdown
# Daily M1 — emulator checklist (Pixel_9, API 36 Google Play image)

- [ ] Fresh install (`adb shell pm clear com.aaronalex.daily`) → onboarding 3 steps → Today
- [ ] Usage access granted from onboarding auto-advances to the goal step
- [ ] "Not now" path → Today banner + Sunny "?" + header "Paused"; granting access later clears both on return
- [ ] Use Chrome/YouTube 5 min → Today time, cards, timeline update within 60 s
- [ ] Phone left on a video past midnight → yesterday and today each get their share (change the emulator clock to test)
- [ ] Force-stop Daily, use apps 20 min, wait for the background task (`adb shell cmd jobscheduler run -f com.aaronalex.daily <job-id>` from `adb shell dumpsys jobscheduler | findstr daily`) → reopening shows the time without a gap
- [ ] Seed a sample day → change goal → Sunny's mood changes at once
- [ ] Category override moves an app between cards
- [ ] Export shares a JSON file; Delete everything returns to onboarding
- [ ] Accessibility → Remove animations → no rise-ins, Sunny still
- [ ] TalkBack reads Sunny's mood, tab names and the mood bar ("Mood 3 of 5")
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-10-06-daily-m1-checklist.md
git commit -m "docs: Daily M1 emulator checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
