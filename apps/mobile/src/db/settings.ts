import type { Db } from './db';

export const DEFAULTS = {
  goal_min: '240',
  retention_days: '90',
  onboarded: '0',
  clock_plan: '',
  last_response: '',
  wind_down: '23:00',
  coach_snooze_until: '0',
  coach_last_response: '',
  sunny_service: '1',
  bubble: '0',
  exact_alarms: '',
  write_time: '21:00',
  dev_plus: '0',
  plus_until: '0', // ms the cached Plus entitlement ends; '-1' = no expiry
  plus_plan: '',
  plus_trial: '0',
  plus_renews: '0',
  last_report_tap: '',
  last_route_tap: '',
  rewrites_today: '', // '<YYYY-MM-DD>|<rewrites used that day>'
  week_ai_try: '' // '<weekStart>|<YYYY-MM-DD>' of the last AI week-sentence try, or '<weekStart>|never' after an invalid answer
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
