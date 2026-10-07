# Daily M4 — checklist

## Setup

- **AI on the emulator** (debug build only; Android blocks plain http in release):
  - `apps/mobile/.env` holds `EXPO_PUBLIC_DAILY_AI_URL=http://10.0.2.2:8787` and `EXPO_PUBLIC_DAILY_AI_TOKEN=dev`.
  - Run `pnpm --filter @worksight/daily-ai dev`, then start Metro with `--clear`.
- **Daily Plus:** Settings → Developer → "Pretend Daily Plus" (M5 replaces this with real billing).
- **Phone build:** `cd apps/mobile && npx expo run:android --variant release --device RMX2151`. A release build has no AI until M5 deploys the function, so reports are plain.

## Report

- [ ] Before 9 pm, Report shows today's live preview and "Daily writes your full report at 9 pm."
- [ ] After 9 pm (or the "Write it at" time), "Your day is ready" arrives once, with the headline. Tapping it opens Report on that day.
- [ ] Highlights: quietest stretch, most opened, longest scroll, after-wind-down minutes.
- [ ] The two "Tomorrow, try" tips can be ticked on a written report and stay ticked.
- [ ] ‹ and › walk through past days and stop at the first day and at today.
- [ ] Share PDF opens the share sheet. The PDF shows the date, headline, story, highlights and tips.
- [ ] Next morning, last night's report counts phone use after 9 pm in its highlights.

## Daily Plus (emulator, with the dev server)

- [ ] The written report says "Your day, written" with a story. The footer reads "Written by Daily Plus · only app names and times are sent".
- [ ] Rewrite gives a new story.
- [ ] With the dev server stopped, Rewrite keeps the report and shows "Couldn't write today's story." Retry works once the server is back.
- [ ] With the dev server stopped at write time, a plain report is saved. Reopening Daily with the server running quietly turns it into a story, without a second notification.
- [ ] Week → Last week shows an AI "Week in a sentence" and keeps it after reopening.

## Week

- [ ] Monday-to-Sunday bars, stacked by category, today outlined, future days flat.
- [ ] Daily average and "↓/↑ … vs last week" are correct.
- [ ] Top apps (a day) and the legend match the bars.
- [ ] With "Remove animations" on, the bars appear without springing.

## Settings

- [ ] "Write it at" steps by 30 minutes and stops at 5 pm and 11:30 pm.
- [ ] With notifications blocked, the Sunny row says so and "Allow" opens Daily's settings.

## Phone (Realme 7)

- [ ] During a WhatsApp or Meet call, no coach nudge appears (goal or wind-down).
- [ ] Everything in "Report" and "Week" above, with plain reports.
- [ ] Still open from M3: run the M3 checklist on a release build.
- [ ] Still open from M2: force-stop re-arm, the exact-alarm card, cold-start "Take a break", a warm time-zone change, and "Allow notifications" opening settings.

## Before M5 deploys the function

- `supabase init --workdir supabase-daily` (once) and `supabase link --workdir supabase-daily --project-ref <ref>`.
- `supabase secrets set --workdir supabase-daily OPENROUTER_API_KEY=…`, copying the value yourself from `apps/consumer/.env`.
- `supabase functions deploy daily-ai --workdir supabase-daily`, only after M5 has replaced the Plus stub.
