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

Checked on the emulator only (phone was disconnected); confirm on the Realme:

- [ ] Force-stop Daily (`adb -s R85H8TTGGULF75UW shell am force-stop com.aaronalex.daily`) → `dumpsys alarm | findstr com.aaronalex.daily` shows no Daily alarms → open Daily → the 13:00 / 16:00 alarms are back
- [ ] With exact alarms allowed for Daily, the Reminders tab shows no "Allow exact timing" card
- [ ] On the break screen, "I'm back" / "I had some" return to the previous screen and count once
