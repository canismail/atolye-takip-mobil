import type { Customer, CustomerStats, Db } from '../db/types';
import { codeFromName, scalar } from './helpers';

export interface CustomerInput {
  name: string; contact: string; phone: string; email: string; address: string; tax_no: string; status: string;
}

export function makeCustomersRepo(db: Db) {
  async function withStats(): Promise<CustomerStats[]> {
    return db.all<CustomerStats>(`
      SELECT c.*,
        (SELECT COALESCE(SUM(amount),0) FROM sales s WHERE s.customer_id=c.id) AS total_sales,
        (SELECT COALESCE(SUM(amount),0) FROM sales s WHERE s.customer_id=c.id AND s.status='Bekliyor') AS balance,
        (SELECT COALESCE(SUM(amount),0) FROM sales s WHERE s.customer_id=c.id AND s.status='Bekliyor'
              AND s.due_date IS NOT NULL AND s.due_date < date('now','localtime')) AS overdue
      FROM customers c ORDER BY c.code`);
  }
  async function save(input: CustomerInput, id?: number): Promise<number> {
    const name = input.name.trim();
    if (!name) throw new Error('Müşteri adı zorunludur.');
    if (input.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
      throw new Error('E-posta adresi geçersiz görünüyor.');
    }
    const vals = [name, input.contact.trim(), input.phone.trim(), input.email.trim(), input.address.trim(),
      input.tax_no.trim(), input.status];
    if (id !== undefined) {
      await db.run('UPDATE customers SET name=?, contact=?, phone=?, email=?, address=?, tax_no=?, status=? WHERE id=?',
        [...vals, id]);
      return id;
    }
    const code = await codeFromName(db, 'customers', name);
    const r = await db.run(
      'INSERT INTO customers(code, name, contact, phone, email, address, tax_no, status) VALUES (?,?,?,?,?,?,?,?)',
      [code, ...vals]);
    return r.lastId;
  }
  async function remove(id: number): Promise<string | null> {
    const s = await scalar(db, 'SELECT COUNT(*) FROM sales WHERE customer_id=?', [id]);
    const w = await scalar(db, 'SELECT COUNT(*) FROM work_orders WHERE customer_id=?', [id]);
    if (s || w) return `Bu müşteriye bağlı ${s} satış ve ${w} sipariş var; silinemez. Durumunu 'Pasif' yapabilirsiniz.`;
    await db.run('DELETE FROM customers WHERE id=?', [id]);
    return null;
  }
  async function setStatus(id: number, status: string): Promise<void> {
    await db.run('UPDATE customers SET status=? WHERE id=?', [status, id]);
  }
  async function get(id: number): Promise<Customer | null> {
    return db.get<Customer>('SELECT * FROM customers WHERE id=?', [id]);
  }
  return { withStats, save, remove, setStatus, get };
}
export type CustomersRepo = ReturnType<typeof makeCustomersRepo>;
