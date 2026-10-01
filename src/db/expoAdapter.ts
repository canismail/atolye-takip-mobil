import * as SQLite from 'expo-sqlite';
import type { Db, Row, SqlParam } from './types';

/** expo-sqlite üzerinden Db arayüzü. */
export async function openExpoDb(name = 'atolye.db'): Promise<Db> {
  const raw = await SQLite.openDatabaseAsync(name);
  await raw.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const db: Db = {
    async all<T = Row>(sql: string, params: SqlParam[] = []) {
      return (await raw.getAllAsync(sql, params)) as T[];
    },
    async get<T = Row>(sql: string, params: SqlParam[] = []) {
      return ((await raw.getFirstAsync(sql, params)) as T | null) ?? null;
    },
    async run(sql: string, params: SqlParam[] = []) {
      const r = await raw.runAsync(sql, params);
      return { lastId: Number(r.lastInsertRowId), changes: Number(r.changes) };
    },
    async exec(sql: string) {
      await raw.execAsync(sql);
    },
    async transaction<T>(fn: () => Promise<T>) {
      let out!: T;
      await raw.withTransactionAsync(async () => {
        out = await fn();
      });
      return out;
    },
  };
  return db;
}
