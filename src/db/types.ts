/** Veritabanı soyutlaması. Uygulama yalnızca bu arayüzü bilir:
 *  - Telefon: expo-sqlite (expoAdapter.ts)
 *  - Testler: node:sqlite (tests/nodeAdapter.ts)
 *  İleride sunucuya geçerken repository katmanı (src/repo) bir API istemcisiyle değiştirilir. */
export type SqlParam = string | number | null;
export type Row = Record<string, any>;

export interface Db {
  all<T = Row>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: SqlParam[]): Promise<T | null>;
  run(sql: string, params?: SqlParam[]): Promise<{ lastId: number; changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------- satır tipleri
export interface StockItem {
  id: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  min_qty: number;
  unit_cost: number;
  created_at: string;
  shape: string | null;
  dim_a: number | null;
  dim_b: number | null;
  length_mm: number | null;
  grade: string | null;
  density: number | null;
  unit_weight: number;
  kg_price: number | null;
  in_stock: number;
  product_id: number | null;
  image: string | null;
  photo: string | null;
  /** Ürün satırlarında ürünün satış fiyatı. */
  sale_price?: number | null;
  status: StockStatus;
  value: number;
  size: string;
}
export type StockStatus = 'Normal' | 'Minimuma Yakın' | 'Kritik';

export interface StockMovement { id: number; stock_id: number; date: string; change: number; note: string | null }

export interface Product {
  id: number; code: string; name: string; category: string; icon: string; unit_price: number;
  status: string; description: string | null; created_at: string; image: string | null;
}
export interface ProductStats extends Product {
  material_count: number; operation_count: number; total_minutes: number; material_cost: number;
}
export interface ProductMaterial {
  id: number; seq: number; quantity: number; code: string; name: string; unit: string;
  unit_cost: number; cost: number; stock_id: number;
}
export interface ProductOperation {
  id: number; product_id: number; seq: number; name: string; minutes: number;
  machine_type?: string | null; setup_minutes?: number | null;
}
export interface Machine {
  id: number; name: string; type: string; daily_hours: number; active: number; note: string | null; changeover_minutes: number;
}
export interface PlanOverride { id: number; work_order_id: number; op_id: number; machine_id: number | null; day: string | null }

export interface Customer {
  id: number; code: string; name: string; contact: string | null; phone: string | null; email: string | null;
  address: string | null; tax_no: string | null; status: string; created_at: string;
}
export interface CustomerStats extends Customer { total_sales: number; balance: number; overdue: number }

export interface Sale {
  id: number; code: string; date: string; customer_id: number | null; product_id: number | null;
  quantity: number; unit_price: number; amount: number; status: string; due_date: string | null;
  paid_date: string | null; note: string | null; customer?: string | null; product?: string | null;
}
export interface Transaction {
  id: number; date: string; type: 'Gelir' | 'Gider'; category: string; description: string | null;
  doc_no: string | null; amount: number; sale_id: number | null;
}
export interface WorkOrder {
  id: number; code: string; customer_id: number | null; product_id: number; quantity: number;
  due_date: string | null; progress: number; status: string; note: string | null; created_at: string;
  completed_at: string | null; customer?: string | null; product?: string | null; unit_minutes: number;
}
export interface MaterialType { name: string; density: number }
