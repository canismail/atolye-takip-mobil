import { DatabaseSync } from 'node:sqlite';
import type { Db, Row, SqlParam } from '../src/db/types';

/** node:sqlite üzerinden Db arayüzü (sunucu ve testler). */
export function openSqlite(path = ':memory:'): Db {
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON');
  let depth = 0;
  const db: Db = {
    async all<T = Row>(sql: string, params: SqlParam[] = []) {
      return (raw.prepare(sql).all(...params) as unknown as T[]).map((r) => ({ ...r })) as T[];
    },
    async get<T = Row>(sql: string, params: SqlParam[] = []) {
      const r = raw.prepare(sql).get(...params) as unknown as T | undefined;
      return r ? ({ ...r } as T) : null;
    },
    async run(sql: string, params: SqlParam[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { lastId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async exec(sql: string) {
      raw.exec(sql);
    },
    async transaction<T>(fn: () => Promise<T>) {
      if (depth > 0) return fn();
      depth++;
      raw.exec('BEGIN');
      try {
        const out = await fn();
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return db;
}
export { openSqlite as openNodeDb };
