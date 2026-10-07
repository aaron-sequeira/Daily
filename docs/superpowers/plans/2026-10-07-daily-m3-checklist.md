# Daily M3 — phone checklist (Realme 7, Android 12)

Build: `cd apps/mobile && npx expo run:android --variant release --device RMX2151`. Debug builds load JS from Metro, so reboot/background items only mean something on a release build.
Reset Daily only: `adb -s R85H8TTGGULF75UW shell run-as com.aaronalex.daily rm -rf files/SQLite`, then `adb -s R85H8TTGGULF75UW shell run-as com.aaronalex.daily rm -f shared_prefs/daily_chip.xml`, then `adb -s R85H8TTGGULF75UW shell am force-stop com.aaronalex.daily`.

- [ ] Onboarding step 4 has "Show Sunny in the status bar" (on) → after finishing, the Sunny notification appears
- [ ] The Sunny icon is visible in the Realme (ColorOS) status bar, not only in the shade
- [ ] Onboarding "Not now" with the Sunny switch on still asks for notifications, and the chip appears after Allow
- [ ] Settings → turning Sunny on asks for notifications if they're off
- [ ] Within a minute the notification shows "<time> today" and "<mood> · <goal line>" with Sunny's face; it updates with Daily in the background
- [ ] Settings → Sunny in the status bar off → notification gone; on → back
- [ ] Reboot the phone with Sunny on → the notification comes back without opening Daily; with Sunny off → it stays off
- [ ] After a reboot, the chip's time changes within about 2 minutes without opening Daily
- [ ] Swipe Daily out of recents → the chip keeps updating (or comes back and updates)
- [ ] Scroll Instagram (or any Social/Fun app) for 30+ minutes → one "30 minutes on …" nudge; no second one for the same stretch
- [ ] Cross 80 % and 100 % of the goal → one nudge each that day
- [ ] Use the phone after 11 pm → one "Time to wind down" nudge that night
- [ ] Tap "Snooze 1 h" on a nudge → no nudges for an hour
- [ ] On a phone call or in Maps for 30+ minutes → no nudge
- [ ] Water reminder arrives within about a minute of crossing an hour of phone time (Daily in the background)
- [ ] Settings → Keep Sunny running shows the Realme steps first; both buttons open Android settings
- [ ] Settings → Wind down after moves by 30 minutes
- [ ] Settings → Wind down after stops at 6:00 pm and 4:30 am
- [ ] Onboarding "Not now" on the reminders step → all built-ins off in Reminders
- [ ] Reminders tab: switches don't flicker; "Break now" opens the break
- [ ] Settings → Delete everything → the Sunny notification disappears
- [ ] Delete everything, then onboard again → the chip never shows the old phone time
- [ ] Onboarding without usage access → the Sunny switch starts off
- [ ] (deferred) Android 16 Live Update chip — needs an androidx.core bump; not in M3
- [ ] Still open from M2: force-stop re-arm, exact-alarm card, cold-start "Take a break", warm time-zone change, "Allow notifications" opens settings
