import type { Db } from './types';
import { DEFAULT_SETTINGS, PRODUCT_MIGRATIONS, SCHEMA, STOCK_CATEGORIES, STOCK_MIGRATIONS } from './schema';

/** Tabloları kurar, eksik sütunları ekler ve varsayılan ayarları yazar (masaüstündeki init_db). */
export async function initDb(db: Db): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON');
  for (const stmt of SCHEMA) await db.run(stmt);

  const haveStock = new Set((await db.all<{ name: string }>('PRAGMA table_info(stock_items)')).map((r) => r.name));
  for (const [col, ddl] of STOCK_MIGRATIONS) {
    if (!haveStock.has(col)) {
      await db.run(`ALTER TABLE stock_items ADD COLUMN ${col} ${ddl}`);
      if (col === 'in_stock') await db.run('UPDATE stock_items SET in_stock=1');
    }
  }
  const haveProd = new Set((await db.all<{ name: string }>('PRAGMA table_info(products)')).map((r) => r.name));
  for (const [col, ddl] of PRODUCT_MIGRATIONS) {
    if (!haveProd.has(col)) await db.run(`ALTER TABLE products ADD COLUMN ${col} ${ddl}`);
  }
  const marks = STOCK_CATEGORIES.map(() => '?').join(',');
  await db.run(
    `UPDATE stock_items SET category='Diğer' WHERE product_id IS NULL AND category NOT IN (${marks})`,
    STOCK_CATEGORIES,
  );
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.run('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', [k, v]);
  }
}
