import initSqlJs from 'sql.js';
import type { Db, Param } from './db';
import { migrate } from './schema';

/** In-memory database without migrations (for upgrade tests). */
export async function makeRawTestDb(): Promise<Db> {
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
  return db;
}

/** In-memory migrated database for tests (sql.js — no native build needed). */
export async function makeTestDb(): Promise<Db> {
  const db = await makeRawTestDb();
  migrate(db);
  return db;
}
