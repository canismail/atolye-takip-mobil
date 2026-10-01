import type { Db } from '../db/types';
import { trAscii } from '../domain/format';

/** Tablodaki `prefix` ile başlayan en büyük numaralı kodun bir fazlası. */
export async function nextCode(db: Db, table: string, prefix: string, width = 3, start = 1): Promise<string> {
  const rows = await db.all<{ code: string }>(`SELECT code FROM ${table} WHERE code LIKE ?`, [prefix + '%']);
  const nums: number[] = [];
  for (const r of rows) {
    const tail = r.code.slice(prefix.length);
    if (/^\d+$/.test(tail)) nums.push(Number(tail));
  }
  const n = nums.length ? Math.max(...nums) + 1 : start;
  return `${prefix}${String(n).padStart(width, '0')}`;
}

/** İsimden okunabilir kod: adın ilk kelimesi (en çok 6 harf) + sıra no ("Masa Ayağı" -> "MASA-01"). */
export async function codeFromName(db: Db, table: string, name: string, digits = 2): Promise<string> {
  const words = trAscii(name || '').toUpperCase().match(/[A-Za-z0-9]+/g) ?? [];
  const root = (words[0]?.slice(0, 6) || 'GEN') || 'GEN';
  const rows = await db.all<{ code: string }>(`SELECT code FROM ${table} WHERE code LIKE ?`, [root + '%']);
  const existing = new Set(rows.map((r) => r.code));
  let n = 1;
  while (existing.has(`${root}-${String(n).padStart(digits, '0')}`)) n++;
  return `${root}-${String(n).padStart(digits, '0')}`;
}

export async function scalar(db: Db, sql: string, params: (string | number | null)[] = [], def = 0): Promise<number> {
  const r = await db.get<Record<string, number | null>>(sql, params);
  if (!r) return def;
  const v = Object.values(r)[0];
  return v === null || v === undefined ? def : Number(v);
}
