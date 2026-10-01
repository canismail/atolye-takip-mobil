import type { Db, WorkOrder } from '../db/types';
import { today } from '../domain/format';
import { nextCode } from './helpers';

export interface OrderInput {
  customer_id: number | null; product_id: number; quantity: number; due_date: string | null;
  progress: number; status: string; note: string; completed_at?: string | null;
}

export function statusForProgress(progress: number, current: string): string {
  if (current === 'İptal') return 'İptal';
  if (progress >= 100) return 'Tamamlandı';
  if (progress > 0) return 'Üretimde';
  return 'Bekliyor';
}

export function makeOrdersRepo(db: Db) {
  async function list(): Promise<WorkOrder[]> {
    return db.all<WorkOrder>(`SELECT w.*, c.name AS customer, p.name AS product,
        (SELECT COALESCE(SUM(o.minutes),0) FROM product_operations o WHERE o.product_id=w.product_id) AS unit_minutes
      FROM work_orders w LEFT JOIN customers c ON c.id=w.customer_id LEFT JOIN products p ON p.id=w.product_id
      ORDER BY CASE w.status WHEN 'Tamamlandı' THEN 2 WHEN 'İptal' THEN 3 ELSE 1 END, w.due_date, w.id`);
  }
  async function save(input: OrderInput, id?: number): Promise<number> {
    const status = input.status || 'Bekliyor';
    const progress = status === 'Tamamlandı' ? 100 : Math.round(input.progress);
    const completed = status === 'Tamamlandı' ? input.completed_at || today() : null;
    const vals = [input.customer_id, input.product_id, input.quantity, input.due_date, progress, status,
      input.note, completed];
    if (id === undefined) {
      const code = await nextCode(db, 'work_orders', 'SIP-', 4, 1001);
      const r = await db.run(
        'INSERT INTO work_orders(code, customer_id, product_id, quantity, due_date, progress, status, note, completed_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?)', [code, ...vals]);
      return r.lastId;
    }
    await db.run('UPDATE work_orders SET customer_id=?, product_id=?, quantity=?, due_date=?, progress=?, status=?, ' +
      'note=?, completed_at=? WHERE id=?', [...vals, id]);
    return id;
  }
  async function updateProgress(id: number, progress: number): Promise<void> {
    const w = await db.get<{ status: string; completed_at: string | null }>(
      'SELECT status, completed_at FROM work_orders WHERE id=?', [id]);
    if (!w) return;
    const status = statusForProgress(progress, w.status);
    const completed = status === 'Tamamlandı' ? w.completed_at || today() : null;
    await db.run('UPDATE work_orders SET progress=?, status=?, completed_at=? WHERE id=?',
      [progress, status, completed, id]);
  }
  async function cancel(id: number): Promise<void> {
    await db.run("UPDATE work_orders SET status='İptal' WHERE id=?", [id]);
  }
  async function reopen(id: number): Promise<void> {
    const w = await db.get<{ progress: number }>('SELECT progress FROM work_orders WHERE id=?', [id]);
    if (w) await db.run('UPDATE work_orders SET status=? WHERE id=?', [statusForProgress(w.progress, 'Bekliyor'), id]);
  }
  async function remove(id: number): Promise<void> {
    await db.run('DELETE FROM work_orders WHERE id=?', [id]);
  }
  return { list, save, updateProgress, cancel, reopen, remove };
}
export type OrdersRepo = ReturnType<typeof makeOrdersRepo>;
