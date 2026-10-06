export type Param = string | number | null;

/** The small slice of SQLite the app uses — expo-sqlite in the app, sql.js in tests. */
export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: Param[]): void;
  all<T>(sql: string, params?: Param[]): T[];
  get<T>(sql: string, params?: Param[]): T | null;
  tx(fn: () => void): void;
}
