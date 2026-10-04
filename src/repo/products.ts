import type { Db, ProductMaterial, ProductOperation, ProductStats, SqlParam } from '../db/types';
import { codeFromName, scalar } from './helpers';

export interface ProductInput {
  name: string; category: string; icon: string; unit_price: number; status: string;
  description: string; image?: string | null;
}

export function makeProductsRepo(db: Db) {
  async function withStats(): Promise<ProductStats[]> {
    return db.all<ProductStats>(`
      SELECT p.*,
        (SELECT COUNT(*) FROM product_materials m WHERE m.product_id=p.id) AS material_count,
        (SELECT COUNT(*) FROM product_operations o WHERE o.product_id=p.id) AS operation_count,
        (SELECT COALESCE(SUM(o.minutes),0) FROM product_operations o WHERE o.product_id=p.id) AS total_minutes,
        (SELECT COALESCE(SUM(m.quantity*s.unit_cost),0) FROM product_materials m
            JOIN stock_items s ON s.id=m.stock_id WHERE m.product_id=p.id) AS material_cost
      FROM products p ORDER BY p.code`);
  }
  async function get(id: number): Promise<ProductStats | null> {
    return (await withStats()).find((p) => p.id === id) ?? null;
  }
  async function save(input: ProductInput, id?: number): Promise<number> {
    const name = input.name.trim();
    if (!name) throw new Error('Ürün adı zorunludur.');
    if (id !== undefined) {
      await db.run(
        'UPDATE products SET name=?, category=?, icon=?, unit_price=?, status=?, description=?, image=? WHERE id=?',
        [name, input.category, input.icon || '📦', input.unit_price, input.status, input.description.trim(),
          input.image ?? null, id]);
      // Ürünün stok satırındaki ad/maliyet de güncel kalsın
      const p = await get(id);
      if (p) await db.run('UPDATE stock_items SET name=?, unit_cost=? WHERE product_id=?', [p.name, p.material_cost || 0, id]);
      return id;
    }
    const code = await codeFromName(db, 'products', name);
    const r = await db.run(
      'INSERT INTO products(code, name, category, icon, unit_price, status, description, image) VALUES (?,?,?,?,?,?,?,?)',
      [code, name, input.category, input.icon || '📦', input.unit_price, input.status, input.description.trim(),
        input.image ?? null]);
    return r.lastId;
  }

  /** Silinemezse hata metni döner. Silinen ürünün foto adı `removedImage`. */
  async function remove(id: number): Promise<{ error: string | null; removedImage: string | null }> {
    const s = await scalar(db, 'SELECT COUNT(*) FROM sales WHERE product_id=?', [id]);
    const w = await scalar(db, 'SELECT COUNT(*) FROM work_orders WHERE product_id=?', [id]);
    if (s || w) {
      return { error: `Bu ürüne bağlı ${s} satış ve ${w} sipariş var; silinemez. Kullanımdan kaldırmak için durumunu 'Pasif' yapabilirsiniz.`, removedImage: null };
    }
    const img = await db.get<{ image: string | null }>('SELECT image FROM products WHERE id=?', [id]);
    await db.transaction(async () => {
      await db.run('DELETE FROM stock_items WHERE product_id=?', [id]);
      await db.run('DELETE FROM products WHERE id=?', [id]);
    });
    return { error: null, removedImage: img?.image ?? null };
  }

  // ---- reçete (malzeme bileşenleri)
  async function materials(productId: number): Promise<ProductMaterial[]> {
    return db.all<ProductMaterial>(
      `SELECT m.id, m.seq, m.quantity, s.code, s.name, s.unit, s.unit_cost,
              m.quantity*s.unit_cost AS cost, s.id AS stock_id
       FROM product_materials m JOIN stock_items s ON s.id=m.stock_id
       WHERE m.product_id=? ORDER BY m.seq, m.id`, [productId]);
  }
  /** Aynı bileşen varsa miktar eklenir (masaüstü ile aynı davranış), yoksa yeni satır. */
  async function saveMaterialRow(productId: number, stockId: number, qty: number, rowId?: number): Promise<void> {
    if (rowId !== undefined) {
      await db.run('UPDATE product_materials SET quantity=? WHERE id=?', [qty, rowId]);
      return;
    }
    const dup = await db.get<{ id: number }>('SELECT id FROM product_materials WHERE product_id=? AND stock_id=?',
      [productId, stockId]);
    if (dup) {
      await db.run('UPDATE product_materials SET quantity=quantity+? WHERE id=?', [qty, dup.id]);
      return;
    }
    const seq = await scalar(db, 'SELECT COALESCE(MAX(seq),0)+1 FROM product_materials WHERE product_id=?', [productId]);
    await db.run('INSERT INTO product_materials(product_id, stock_id, quantity, seq) VALUES (?,?,?,?)',
      [productId, stockId, qty, seq]);
  }

  // ---- operasyonlar
  async function operations(productId: number): Promise<ProductOperation[]> {
    return db.all<ProductOperation>('SELECT * FROM product_operations WHERE product_id=? ORDER BY seq, id', [productId]);
  }
  /** machineType: boş = herhangi bir makine · setupMinutes: boş/0 = makinenin varsayılan ayarlama süresi */
  async function saveOperation(productId: number, name: string, minutes: number, rowId?: number,
    machineType?: string | null, setupMinutes?: number): Promise<void> {
    if (!name.trim()) throw new Error('Operasyon adı zorunludur.');
    const mt = (machineType ?? '').trim() || null;
    const setup = Math.max(0, Number(setupMinutes ?? 0) || 0);
    if (rowId !== undefined) {
      await db.run('UPDATE product_operations SET name=?, minutes=?, machine_type=?, setup_minutes=? WHERE id=?',
        [name.trim(), minutes, mt, setup, rowId]);
      return;
    }
    const seq = await scalar(db, 'SELECT COALESCE(MAX(seq),0)+1 FROM product_operations WHERE product_id=?', [productId]);
    await db.run('INSERT INTO product_operations(product_id, seq, name, minutes, machine_type, setup_minutes) VALUES (?,?,?,?,?,?)',
      [productId, seq, name.trim(), minutes, mt, setup]);
  }

  // ---- sıralama (reçete ve operasyon ortak)
  type OrderedTable = 'product_materials' | 'product_operations';
  async function renumber(table: OrderedTable, productId: number): Promise<void> {
    const rows = await db.all<{ id: number }>(`SELECT id FROM ${table} WHERE product_id=? ORDER BY seq, id`, [productId]);
    for (let i = 0; i < rows.length; i++) await db.run(`UPDATE ${table} SET seq=? WHERE id=?`, [i + 1, rows[i].id]);
  }
  async function moveRow(table: OrderedTable, productId: number, rowId: number, direction: -1 | 1): Promise<void> {
    await renumber(table, productId);
    const ids = (await db.all<{ id: number }>(`SELECT id FROM ${table} WHERE product_id=? ORDER BY seq`, [productId]))
      .map((r) => r.id);
    const i = ids.indexOf(rowId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (let k = 0; k < ids.length; k++) await db.run(`UPDATE ${table} SET seq=? WHERE id=?` as string, [k + 1, ids[k]] as SqlParam[]);
  }
  async function removeRow(table: OrderedTable, productId: number, rowId: number): Promise<void> {
    await db.run(`DELETE FROM ${table} WHERE id=?`, [rowId]);
    await renumber(table, productId);
  }

  return { withStats, get, save, remove, materials, saveMaterialRow, operations, saveOperation, moveRow, removeRow };
}
export type ProductsRepo = ReturnType<typeof makeProductsRepo>;
