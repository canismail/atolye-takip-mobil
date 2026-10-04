import type { Db } from './types';
import {
  DEFAULT_MACHINES, DEFAULT_SETTINGS, MACHINE_MIGRATIONS, OPERATION_MIGRATIONS, PRODUCT_MIGRATIONS, SCHEMA, STOCK_CATEGORIES,
  STOCK_MIGRATIONS,
} from './schema';

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
  const haveOps = new Set((await db.all<{ name: string }>('PRAGMA table_info(product_operations)')).map((r) => r.name));
  for (const [col, ddl] of OPERATION_MIGRATIONS) {
    if (!haveOps.has(col)) await db.run(`ALTER TABLE product_operations ADD COLUMN ${col} ${ddl}`);
  }
  const haveMach = new Set((await db.all<{ name: string }>('PRAGMA table_info(machines)')).map((r) => r.name));
  for (const [col, ddl] of MACHINE_MIGRATIONS) {
    if (!haveMach.has(col)) await db.run(`ALTER TABLE machines ADD COLUMN ${col} ${ddl}`);
  }
  const marks = STOCK_CATEGORIES.map(() => '?').join(',');
  await db.run(
    `UPDATE stock_items SET category='Diğer' WHERE product_id IS NULL AND category NOT IN (${marks})`,
    STOCK_CATEGORIES,
  );
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.run('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', [k, v]);
  }
  await seedMaterialType(db, '1050 (Çelik)', 7.85, 'seed_mt_1050');
  await seedMachines(db);
}

/** Atölyenin 4 makinesini ilk kurulumda bir kez ekler (sonradan silinirse geri gelmez). */
async function seedMachines(db: Db): Promise<void> {
  if (await db.get("SELECT 1 FROM settings WHERE key='seed_machines'")) return;
  const cnt = await db.get<{ c: number }>('SELECT COUNT(*) AS c FROM machines');
  if (!cnt || cnt.c === 0) {
    for (const [name, type] of DEFAULT_MACHINES) {
      await db.run('INSERT INTO machines(name, type, daily_hours, active) VALUES (?,?,8,1)', [name, type]);
    }
  }
  await db.run("INSERT OR REPLACE INTO settings(key, value) VALUES ('seed_machines', '1')");
}

/** Var olan veritabanlarına yeni bir malzeme cinsini bir kez ekler (kullanıcı sonradan silerse geri gelmez). */
async function seedMaterialType(db: Db, name: string, density: number, flag: string): Promise<void> {
  if (await db.get('SELECT 1 FROM settings WHERE key=?', [flag])) return;
  const row = await db.get<{ value: string | null }>("SELECT value FROM settings WHERE key='material_types'");
  let rows: { name?: string; density?: number }[] = [];
  try { rows = row?.value ? JSON.parse(row.value) : []; } catch { rows = []; }
  const prefix = name.split(' ')[0];
  if (!rows.some((r) => String(r.name ?? '').startsWith(prefix))) {
    let idx = rows.findIndex((r) => String(r.name ?? '').startsWith('1040'));
    if (idx < 0) idx = rows.length - 1;
    rows.splice(idx + 1, 0, { name, density });
    await db.run("INSERT INTO settings(key, value) VALUES ('material_types', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [JSON.stringify(rows)]);
  }
  await db.run("INSERT INTO settings(key, value) VALUES (?, '1')", [flag]);
}
