import DailyNative from '../../modules/daily-native';
import { getDb } from '../db/expoDb';
import { sync } from './sync';

let running: Promise<'ok' | 'no_access'> | null = null;

/** One sync at a time: the foreground refresh and the background task share this promise. */
export function runSync(): Promise<'ok' | 'no_access'> {
  running ??= sync(getDb(), DailyNative, Date.now()).finally(() => { running = null; });
  return running;
}
