import type { Db } from '../db/types';
import { monthKey } from '../domain/format';
import { scalar } from './helpers';
import { STOCK_VALUE_SQL } from './stock';

export interface MonthSummary {
  month: string; sales: number; income: number; production: number; personnel: number; other: number; net: number;
}

export function makeMetricsRepo(db: Db) {
  const thisMonth = () => monthKey(new Date());

  async function salesTotal(o: { month?: string; year?: string; status?: string } = {}): Promise<number> {
    let sql = 'SELECT COALESCE(SUM(amount),0) FROM sales WHERE 1=1';
    const p: string[] = [];
    if (o.month) { sql += ' AND substr(date,1,7)=?'; p.push(o.month); }
    if (o.year) { sql += ' AND substr(date,1,4)=?'; p.push(o.year); }
    if (o.status) { sql += ' AND status=?'; p.push(o.status); }
    return scalar(db, sql, p);
  }
  async function salesCount(month: string): Promise<number> {
    return scalar(db, 'SELECT COUNT(*) FROM sales WHERE substr(date,1,7)=?', [month]);
  }
  async function txTotal(kind: 'Gelir' | 'Gider', o: { month?: string; year?: string; categories?: string[];
    exclude?: string[] } = {}): Promise<number> {
    let sql = 'SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type=?';
    const p: string[] = [kind];
    if (o.month) { sql += ' AND substr(date,1,7)=?'; p.push(o.month); }
    if (o.year) { sql += ' AND substr(date,1,4)=?'; p.push(o.year); }
    if (o.categories?.length) { sql += ` AND category IN (${o.categories.map(() => '?').join(',')})`; p.push(...o.categories); }
    if (o.exclude?.length) { sql += ` AND category NOT IN (${o.exclude.map(() => '?').join(',')})`; p.push(...o.exclude); }
    return scalar(db, sql, p);
  }
  async function net(o: { month?: string; year?: string } = {}): Promise<number> {
    return (await txTotal('Gelir', o)) - (await txTotal('Gider', o));
  }
  async function monthlySales(year: string): Promise<number[]> {
    const rows = await db.all<{ m: string; t: number }>(
      'SELECT substr(date,6,2) AS m, SUM(amount) AS t FROM sales WHERE substr(date,1,4)=? GROUP BY m', [year]);
    const vals = new Array<number>(12).fill(0);
    for (const r of rows) vals[Number(r.m) - 1] = Number(r.t || 0);
    return vals;
  }
  async function yearsWithData(): Promise<string[]> {
    const ys = new Set<string>([String(new Date().getFullYear())]);
    for (const r of await db.all<{ y: string | null }>(
      'SELECT DISTINCT substr(date,1,4) AS y FROM sales UNION SELECT DISTINCT substr(date,1,4) FROM transactions')) {
      if (r.y) ys.add(r.y);
    }
    return [...ys].sort().reverse();
  }
  async function monthsWithData(): Promise<string[]> {
    const ms = new Set<string>([thisMonth()]);
    for (const r of await db.all<{ m: string | null }>(
      'SELECT DISTINCT substr(date,1,7) AS m FROM transactions UNION SELECT DISTINCT substr(date,1,7) FROM sales')) {
      if (r.m) ms.add(r.m);
    }
    return [...ms].sort().reverse();
  }
  const receivables = () => scalar(db, "SELECT COALESCE(SUM(amount),0) FROM sales WHERE status='Bekliyor'");
  const overdueReceivables = () => scalar(db,
    "SELECT COALESCE(SUM(amount),0) FROM sales WHERE status='Bekliyor' AND due_date IS NOT NULL AND due_date < date('now','localtime')");

  /** Ay içinde gerçekleşen üretim saati: o ay tamamlanan siparişler + üretimdekilerin ilerleme payı. */
  async function productionHours(month: string): Promise<number> {
    const rows = await db.all<{ quantity: number; progress: number; status: string; completed_at: string | null; mins: number }>(
      `SELECT w.quantity, w.progress, w.status, w.completed_at,
        (SELECT COALESCE(SUM(minutes),0) FROM product_operations o WHERE o.product_id=w.product_id) AS mins
       FROM work_orders w WHERE w.status IN ('Tamamlandı','Üretimde')`);
    let total = 0;
    for (const r of rows) {
      if (r.status === 'Tamamlandı' && (r.completed_at || '').slice(0, 7) === month) total += r.quantity * r.mins;
      else if (r.status === 'Üretimde') total += (r.quantity * r.mins * r.progress) / 100;
    }
    return total / 60;
  }
  const stockValue = () => scalar(db, STOCK_VALUE_SQL);

  /** Satılan ürünlerin reçete malzeme maliyeti / mevcut stok değeri (yıllıklandırılmış). */
  async function stockTurnover(year: string): Promise<number> {
    const cogs = await scalar(db,
      `SELECT COALESCE(SUM(s.quantity * (
          SELECT COALESCE(SUM(m.quantity*si.unit_cost),0) FROM product_materials m
          JOIN stock_items si ON si.id=m.stock_id WHERE m.product_id=s.product_id)),0)
       FROM sales s WHERE substr(s.date,1,4)=?`, [year]);
    const sv = await stockValue();
    if (sv <= 0 || cogs <= 0) return 0;
    const now = new Date();
    let factor = 1;
    if (String(now.getFullYear()) === year) {
      const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
        new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
      factor = 365 / Math.max(1, days);
    }
    return (cogs * factor) / sv;
  }
  async function topProducts(year: string, limit?: number) {
    let sql = `SELECT p.code, p.name, SUM(s.quantity) AS qty, SUM(s.amount) AS revenue
      FROM sales s JOIN products p ON p.id=s.product_id WHERE substr(s.date,1,4)=? GROUP BY p.id ORDER BY revenue DESC`;
    if (limit) sql += ` LIMIT ${Math.floor(limit)}`;
    return db.all<{ code: string; name: string; qty: number; revenue: number }>(sql, [year]);
  }
  async function monthlySummary(year: string): Promise<MonthSummary[]> {
    const out: MonthSummary[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const income = await txTotal('Gelir', { month: key });
      const production = await txTotal('Gider', { month: key, categories: ['Malzeme', 'Bakım', 'Enerji'] });
      const personnel = await txTotal('Gider', { month: key, categories: ['Personel'] });
      const other = await txTotal('Gider', { month: key, exclude: ['Malzeme', 'Bakım', 'Enerji', 'Personel'] });
      out.push({ month: key, sales: await salesTotal({ month: key }), income, production, personnel, other,
        net: income - production - personnel - other });
    }
    return out;
  }
  async function counts(month: string) {
    return {
      products: await scalar(db, 'SELECT COUNT(*) FROM products'),
      newProducts: await scalar(db, 'SELECT COUNT(*) FROM products WHERE substr(created_at,1,7)=?', [month]),
      customers: await scalar(db, 'SELECT COUNT(*) FROM customers'),
    };
  }
  return { counts, thisMonth, salesTotal, salesCount, txTotal, net, monthlySales, yearsWithData, monthsWithData, receivables,
    overdueReceivables, productionHours, stockValue, stockTurnover, topProducts, monthlySummary };
}
export type MetricsRepo = ReturnType<typeof makeMetricsRepo>;
