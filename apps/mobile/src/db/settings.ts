import type { Db } from './db';

export const DEFAULTS = {
  goal_min: '240',
  retention_days: '90',
  onboarded: '0',
  clock_plan: '',
  last_response: ''
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
