import type { Db, Sale, Transaction } from '../db/types';
import { today } from '../domain/format';
import { nextCode } from './helpers';

export interface SaleInput {
  date: string; customer_id: number | null; product_id: number | null; quantity: number; unit_price: number;
  amount: number; status: string; due_date: string | null; paid_date: string | null; note: string;
}
export interface TransactionInput {
  date: string; type: 'Gelir' | 'Gider'; category: string; description: string; doc_no: string; amount: number;
}

export function makeSalesRepo(db: Db) {
  async function list(): Promise<Sale[]> {
    return db.all<Sale>(`SELECT s.*, c.name AS customer, p.name AS product FROM sales s
      LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id
      ORDER BY s.date DESC, s.id DESC`);
  }

  /** Satış 'Ödendi' ise ona bağlı tek bir gelir kaydı olmasını sağlar, 'Bekliyor' ise kaldırır. */
  async function syncIncome(saleId: number): Promise<void> {
    const s = await db.get<any>(
      'SELECT s.*, p.name AS product FROM sales s LEFT JOIN products p ON p.id=s.product_id WHERE s.id=?', [saleId]);
    if (!s) return;
    const existing = await db.get<{ id: number }>('SELECT id FROM transactions WHERE sale_id=?', [saleId]);
    if (s.status === 'Ödendi') {
      const desc = `${s.product || 'Ürün'} satışı`;
      const paid = s.paid_date || s.date;
      if (existing) {
        await db.run('UPDATE transactions SET date=?, amount=?, description=?, doc_no=? WHERE id=?',
          [paid, s.amount, desc, s.code, existing.id]);
      } else {
        await db.run(
          "INSERT INTO transactions(date, type, category, description, doc_no, amount, sale_id) VALUES (?, 'Gelir', 'Satış', ?, ?, ?, ?)",
          [paid, desc, s.code, s.amount, saleId]);
      }
    } else if (existing) {
      await db.run('DELETE FROM transactions WHERE id=?', [existing.id]);
    }
  }

  async function save(input: SaleInput, id?: number): Promise<number> {
    const data = { ...input };
    if (data.status === 'Ödendi' && !data.paid_date) data.paid_date = today();
    if (data.status !== 'Ödendi') data.paid_date = null;
    const vals = [data.date, data.customer_id, data.product_id, data.quantity, data.unit_price, data.amount,
      data.status, data.due_date, data.paid_date, data.note];
    return db.transaction(async () => {
      let saleId = id;
      if (saleId === undefined) {
        const code = await nextCode(db, 'sales', 'S-', 4, 1001);
        const r = await db.run(
          'INSERT INTO sales(code, date, customer_id, product_id, quantity, unit_price, amount, status, due_date, paid_date, note) ' +
            'VALUES (?,?,?,?,?,?,?,?,?,?,?)', [code, ...vals]);
        saleId = r.lastId;
      } else {
        await db.run('UPDATE sales SET date=?, customer_id=?, product_id=?, quantity=?, unit_price=?, amount=?, ' +
          'status=?, due_date=?, paid_date=?, note=? WHERE id=?', [...vals, saleId]);
      }
      await syncIncome(saleId);
      return saleId;
    });
  }

  async function markPaid(id: number, paidOn?: string): Promise<void> {
    await db.transaction(async () => {
      await db.run("UPDATE sales SET status='Ödendi', paid_date=? WHERE id=?", [paidOn || today(), id]);
      await syncIncome(id);
    });
  }
  async function markPending(id: number): Promise<void> {
    await db.transaction(async () => {
      await db.run("UPDATE sales SET status='Bekliyor', paid_date=NULL WHERE id=?", [id]);
      await syncIncome(id);
    });
  }
  async function remove(id: number): Promise<void> {
    await db.transaction(async () => {
      await db.run('DELETE FROM transactions WHERE sale_id=?', [id]);
      await db.run('DELETE FROM sales WHERE id=?', [id]);
    });
  }

  // ---- gelir / gider
  async function transactions(): Promise<Transaction[]> {
    return db.all<Transaction>('SELECT * FROM transactions ORDER BY date DESC, id DESC');
  }
  async function saveTransaction(input: TransactionInput, id?: number): Promise<number> {
    if (!(input.amount > 0)) throw new Error('Tutar sıfırdan büyük olmalı.');
    const vals = [input.date, input.type, input.category || 'Diğer', input.description.trim(), input.doc_no.trim(), input.amount];
    if (id !== undefined) {
      await db.run('UPDATE transactions SET date=?, type=?, category=?, description=?, doc_no=?, amount=? WHERE id=?',
        [...vals, id]);
      return id;
    }
    const r = await db.run('INSERT INTO transactions(date, type, category, description, doc_no, amount) VALUES (?,?,?,?,?,?)', vals);
    return r.lastId;
  }
  async function removeTransaction(id: number): Promise<void> {
    await db.run('DELETE FROM transactions WHERE id=?', [id]);
  }
  async function usedCategories(type: 'Gelir' | 'Gider'): Promise<string[]> {
    return (await db.all<{ category: string }>('SELECT DISTINCT category FROM transactions WHERE type=?', [type])).map((r) => r.category);
  }
  return { usedCategories, list, save, markPaid, markPending, remove, transactions, saveTransaction, removeTransaction };
}
export type SalesRepo = ReturnType<typeof makeSalesRepo>;
