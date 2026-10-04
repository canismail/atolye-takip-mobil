import { DEFAULT_DENSITY } from '../db/schema';
import type { Db, SqlParam, StockItem, StockMovement } from '../db/types';
import { today } from '../domain/format';
import { calcUnitWeight, hammaddeUnitCost, materialDensity, sizeLabel, stockStatus } from '../domain/weight';
import { codeFromName, scalar } from './helpers';
import type { SettingsRepo } from './settings';

export interface MaterialInput {
  name: string;
  category: string;
  unit: string;
  min_qty: number;
  /** Hammadde dışında girilen birim maliyet (hammaddede hesaplanır). */
  unit_cost: number;
  /** rect: dim_a=en, dim_b=boy · round: dim_a=çap · pipe: dim_a=dış çap, dim_b=et kalınlığı */
  shape?: 'rect' | 'round' | 'pipe' | null;
  dim_a?: number;
  dim_b?: number;
  length_mm?: number;
  grade?: string | null;
  kg_price?: number | null;
  image?: string | null;
}

export const STOCK_VALUE_SQL =
  'SELECT COALESCE(SUM(s.quantity * CASE WHEN s.product_id IS NOT NULL THEN COALESCE(p.unit_price,0) ELSE s.unit_cost END),0) ' +
  'FROM stock_items s LEFT JOIN products p ON p.id=s.product_id WHERE s.in_stock=1';

export function makeStockRepo(db: Db, settings: SettingsRepo, products: { withStats(): Promise<any[]> }) {
  async function list(opts: { inStock?: boolean; withProducts?: boolean } = {}): Promise<StockItem[]> {
    const near = Number((await settings.get('near_min_pct')) || 20);
    const where: string[] = [];
    if (opts.inStock) where.push('s.in_stock=1');
    if (!opts.withProducts) where.push('s.product_id IS NULL');
    const rows = await db.all<StockItem>(
      'SELECT s.*, COALESCE(s.image, p.image) AS photo, p.unit_price AS sale_price FROM stock_items s LEFT JOIN products p ON p.id=s.product_id' +
        (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY s.code',
    );
    for (const r of rows) {
      r.status = stockStatus(r.quantity, r.min_qty, near);
      // Ürün (mamul) satırlarında değer satış fiyatı, malzemelerde maliyet üzerinden
      r.value = r.quantity * (r.product_id ? r.sale_price ?? 0 : r.unit_cost);
      r.size = sizeLabel(r);
    }
    return rows;
  }

  async function get(id: number): Promise<StockItem | null> {
    return (await list({ withProducts: true })).find((r) => r.id === id) ?? null;
  }

  /** Malzeme bileşeni ekler/günceller. Hammaddede ağırlık ve maliyet hesaplanır. */
  async function saveMaterial(input: MaterialInput, id?: number): Promise<number> {
    const name = input.name.trim();
    if (!name) throw new Error('Bileşen adı zorunludur.');
    const isHam = input.category === 'Hammadde';
    let unit = input.unit;
    let cost = input.unit_cost;
    let shape: string | null = null, a: number | null = null, b: number | null = null, len: number | null = null;
    let grade: string | null = null, density: number | null = null, weight = 0, kg: number | null = null;
    if (isHam) {
      shape = input.shape ?? 'rect';
      if (shape === 'pipe') {
        const d = input.dim_a ?? 0, t = input.dim_b ?? 0;
        if (d > 0 && (t <= 0 || 2 * t > d)) throw new Error("Boru için et kalınlığı 0'dan büyük ve dış çapın yarısından küçük/eşit olmalıdır.");
      }
      a = input.dim_a ?? 0;
      b = shape === 'round' ? 0 : input.dim_b ?? 0;
      len = input.length_mm ?? 0;
      grade = input.grade ?? null;
      const types = await settings.materialTypes();
      density = grade ? materialDensity(types, grade, DEFAULT_DENSITY) : 0;
      weight = calcUnitWeight(shape, a, b, len, density);
      kg = input.kg_price ?? 0;
      cost = hammaddeUnitCost(unit, weight, kg);
      if (weight > 0) unit = 'adet';
    }
    const extra: SqlParam[] = isHam ? [shape, a, b, len, grade, density, weight, kg] : [null, null, null, null, null, null, 0, null];
    if (id !== undefined) {
      await db.run(
        'UPDATE stock_items SET name=?, category=?, unit=?, min_qty=?, unit_cost=?, shape=?, dim_a=?, dim_b=?, ' +
          'length_mm=?, grade=?, density=?, unit_weight=?, kg_price=?, image=? WHERE id=?',
        [name, input.category, unit, input.min_qty, cost, ...extra, input.image ?? null, id],
      );
      return id;
    }
    const code = await codeFromName(db, 'stock_items', name);
    const r = await db.run(
      'INSERT INTO stock_items(code, name, category, unit, quantity, min_qty, unit_cost, shape, dim_a, dim_b, ' +
        'length_mm, grade, density, unit_weight, kg_price, image) VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?)',
      [code, name, input.category, unit, input.min_qty, cost, ...extra, input.image ?? null],
    );
    return r.lastId;
  }

  /** Ayarlardaki yoğunluklar değişince tüm hammaddelerin ağırlık ve maliyetini yeniden hesaplar. */
  async function recalcHammadde(): Promise<number> {
    const types = await settings.materialTypes();
    const rows = await db.all<any>("SELECT * FROM stock_items WHERE category='Hammadde' AND shape IS NOT NULL");
    await db.transaction(async () => {
      for (const r of rows) {
        const dens = materialDensity(types, r.grade, r.density || DEFAULT_DENSITY);
        const w = calcUnitWeight(r.shape, r.dim_a || 0, r.dim_b || 0, r.length_mm || 0, dens);
        const cost = r.kg_price === null ? r.unit_cost : hammaddeUnitCost(r.unit, w, r.kg_price);
        const unit = w > 0 && r.kg_price !== null ? 'adet' : r.unit;
        await db.run('UPDATE stock_items SET density=?, unit_weight=?, unit_cost=?, unit=? WHERE id=?',
          [dens, w, cost, unit, r.id]);
      }
    });
    return rows.length;
  }

  async function movements(stockId: number, limit = 50): Promise<StockMovement[]> {
    return db.all<StockMovement>('SELECT * FROM stock_movements WHERE stock_id=? ORDER BY date DESC, id DESC LIMIT ?',
      [stockId, limit]);
  }

  async function addMovement(stockId: number, change: number, note = '', on?: string): Promise<void> {
    await db.transaction(async () => {
      await db.run('UPDATE stock_items SET quantity = quantity + ? WHERE id=?', [change, stockId]);
      await db.run('INSERT INTO stock_movements(stock_id, date, change, note) VALUES (?,?,?,?)',
        [stockId, on || today(), change, note]);
    });
  }

  async function addToStock(stockId: number, qty = 0, note = '', on?: string): Promise<void> {
    await db.run('UPDATE stock_items SET in_stock=1 WHERE id=?', [stockId]);
    if (qty) await addMovement(stockId, qty, note || 'İlk stok girişi', on);
  }

  /** Ürünü (mamul) stok listesine ekler; stok satırı yoksa oluşturur. Birim maliyet = malzeme maliyeti. */
  async function addProductToStock(productId: number, qty = 0, note = '', on?: string): Promise<number> {
    const p = (await products.withStats()).find((x) => x.id === productId);
    if (!p) throw new Error('Ürün bulunamadı.');
    const row = await db.get<{ id: number }>('SELECT id FROM stock_items WHERE product_id=?', [productId]);
    let sid: number;
    if (row) {
      sid = row.id;
      await db.run('UPDATE stock_items SET in_stock=1, name=?, unit_cost=? WHERE id=?', [p.name, p.material_cost || 0, sid]);
    } else {
      const r = await db.run(
        'INSERT INTO stock_items(code, name, category, unit, quantity, min_qty, unit_cost, in_stock, product_id) ' +
          "VALUES (?,?,?,?,0,0,?,1,?)",
        ['URN-' + p.code, p.name, 'Ürün', 'adet', p.material_cost || 0, productId],
      );
      sid = r.lastId;
    }
    if (qty) await addMovement(sid, qty, note || 'İlk stok girişi', on);
    return sid;
  }

  async function removeFromStock(stockId: number): Promise<string | null> {
    const q = await scalar(db, 'SELECT quantity FROM stock_items WHERE id=?', [stockId]);
    if (q) return 'Stokta miktar var. Önce stok hareketiyle miktarı sıfırlayın.';
    await db.run('UPDATE stock_items SET in_stock=0 WHERE id=?', [stockId]);
    return null;
  }

  /** Hata mesajı döndürür (silinemezse); silinen fotoğraf dosya adı `removedImage` ile gelir. */
  async function remove(stockId: number): Promise<{ error: string | null; removedImage: string | null }> {
    const used = await scalar(db, 'SELECT COUNT(*) FROM product_materials WHERE stock_id=?', [stockId]);
    if (used) return { error: `Bu kalem ${used} ürün reçetesinde kullanılıyor. Önce reçetelerden çıkarın.`, removedImage: null };
    const img = await db.get<{ image: string | null }>('SELECT image FROM stock_items WHERE id=?', [stockId]);
    await db.run('DELETE FROM stock_items WHERE id=?', [stockId]);
    return { error: null, removedImage: img?.image ?? null };
  }

  async function usedIn(stockId: number) {
    return db.all<{ code: string; name: string; quantity: number }>(
      'SELECT p.code, p.name, m.quantity FROM product_materials m JOIN products p ON p.id=m.product_id WHERE m.stock_id=?',
      [stockId]);
  }

  /** Ürünün (mamul) stok satırı; yoksa null. */
  async function forProduct(productId: number): Promise<{ id: number; quantity: number; in_stock: number } | null> {
    return db.get('SELECT id, quantity, in_stock FROM stock_items WHERE product_id=?', [productId]);
  }

  async function stockValue(): Promise<number> {
    return scalar(db, STOCK_VALUE_SQL);
  }

  async function stockCost(): Promise<number> {
    return scalar(db, 'SELECT COALESCE(SUM(quantity * unit_cost),0) FROM stock_items WHERE in_stock=1');
  }

  return { forProduct, list, get, saveMaterial, recalcHammadde, movements, addMovement, addToStock, addProductToStock,
    removeFromStock, remove, usedIn, stockValue, stockCost };
}
export type StockRepo = ReturnType<typeof makeStockRepo>;
