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
