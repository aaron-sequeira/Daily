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
