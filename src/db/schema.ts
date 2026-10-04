/** Masaüstü sürümündeki (ERP-AI/core/db.py) şemanın birebir karşılığı. */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS stock_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT 'Hammadde',
    unit       TEXT NOT NULL DEFAULT 'adet',
    quantity   REAL NOT NULL DEFAULT 0,
    min_qty    REAL NOT NULL DEFAULT 0,
    unit_cost  REAL NOT NULL DEFAULT 0,
    location   TEXT,
    created_at TEXT NOT NULL DEFAULT (date('now','localtime')),
    shape       TEXT,
    dim_a       REAL,
    dim_b       REAL,
    length_mm   REAL,
    grade       TEXT,
    density     REAL,
    unit_weight REAL NOT NULL DEFAULT 0,
    kg_price    REAL,
    in_stock    INTEGER NOT NULL DEFAULT 0,
    product_id  INTEGER,
    image       TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id  INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
    date      TEXT NOT NULL,
    change    REAL NOT NULL,
    note      TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'Metal Ürün',
    icon        TEXT NOT NULL DEFAULT '📦',
    unit_price  REAL NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'Aktif',
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (date('now','localtime')),
    image       TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS product_materials (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stock_id   INTEGER NOT NULL REFERENCES stock_items(id),
    quantity   REAL NOT NULL DEFAULT 1,
    seq        INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS product_operations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL DEFAULT 1,
    name       TEXT NOT NULL,
    minutes    REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    contact    TEXT,
    phone      TEXT,
    email      TEXT,
    address    TEXT,
    tax_no     TEXT,
    status     TEXT NOT NULL DEFAULT 'Aktif',
    created_at TEXT NOT NULL DEFAULT (date('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS sales (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT UNIQUE NOT NULL,
    date        TEXT NOT NULL,
    customer_id INTEGER REFERENCES customers(id),
    product_id  INTEGER REFERENCES products(id),
    quantity    REAL NOT NULL DEFAULT 1,
    unit_price  REAL NOT NULL DEFAULT 0,
    amount      REAL NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'Bekliyor',
    due_date    TEXT,
    paid_date   TEXT,
    note        TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('Gelir','Gider')),
    category    TEXT NOT NULL DEFAULT 'Diğer',
    description TEXT,
    doc_no      TEXT,
    amount      REAL NOT NULL DEFAULT 0,
    sale_id     INTEGER REFERENCES sales(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS work_orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT UNIQUE NOT NULL,
    customer_id  INTEGER REFERENCES customers(id),
    product_id   INTEGER NOT NULL REFERENCES products(id),
    quantity     REAL NOT NULL DEFAULT 1,
    due_date     TEXT,
    progress     INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'Bekliyor',
    note         TEXT,
    created_at   TEXT NOT NULL DEFAULT (date('now','localtime')),
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS machines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'Torna',
    daily_hours REAL NOT NULL DEFAULT 8,
    active      INTEGER NOT NULL DEFAULT 1,
    note        TEXT,
    changeover_minutes REAL NOT NULL DEFAULT 120
  )`,
  `CREATE TABLE IF NOT EXISTS plan_overrides (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL,
    op_id         INTEGER NOT NULL,
    machine_id    INTEGER,
    day           TEXT,
    UNIQUE(work_order_id, op_id)
  )`,
];

export const DEFAULT_MATERIAL_TYPES = [
  { name: '1040 (Çelik)', density: 7.85 },
  { name: '1050 (Çelik)', density: 7.85 },
  { name: 'St37 (Çelik)', density: 7.85 },
  { name: 'Paslanmaz 304', density: 7.93 },
  { name: 'Alüminyum', density: 2.7 },
  { name: 'Pirinç', density: 8.5 },
  { name: 'Bakır', density: 8.96 },
  { name: 'Döküm', density: 7.2 },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  company_name: 'CMS Teknik Mühendislik',
  company_phone: '',
  company_email: '',
  company_address: '',
  company_tax_office: '',
  company_tax_no: '',
  user_name: 'Can Meral',
  currency: 'TRY',
  tax_rate: '20',
  stock_alert: '1',
  near_min_pct: '20',
  sales_target: '300000',
  capacity_hours: '300',
  turnover_target: '6',
  plan_daily_hours: '8',
  plan_week_days: '5',
  plan_buffer_pct: '15',
  plan_workers: '1',
  plan_shift_start: '08:00',
  material_types: JSON.stringify(DEFAULT_MATERIAL_TYPES),
};

export const STOCK_CATEGORIES = ['Yedek Parça', 'Hammadde', 'Diğer'];
export const DEFAULT_DENSITY = 7.85;
export const STOCK_MIGRATIONS: [string, string][] = [
  ['shape', 'TEXT'], ['dim_a', 'REAL'], ['dim_b', 'REAL'], ['length_mm', 'REAL'],
  ['grade', 'TEXT'], ['density', 'REAL'], ['unit_weight', 'REAL NOT NULL DEFAULT 0'],
  ['kg_price', 'REAL'], ['in_stock', 'INTEGER NOT NULL DEFAULT 0'], ['product_id', 'INTEGER'], ['image', 'TEXT'],
];
export const PRODUCT_MIGRATIONS: [string, string][] = [['image', 'TEXT']];
/** Operasyon: makine türü, sök-tak (hazırlık) süresi (parallel/part eski masaüstü sürümlerinden kalma, kullanılmıyor) */
export const OPERATION_MIGRATIONS: [string, string][] = [
  ['machine_type', 'TEXT'], ['setup_minutes', 'REAL NOT NULL DEFAULT 0'], ['parallel', 'INTEGER NOT NULL DEFAULT 0'], ['part', 'TEXT'],
];
export const MACHINE_MIGRATIONS: [string, string][] = [['changeover_minutes', 'REAL NOT NULL DEFAULT 120']];
export const DEFAULT_MACHINES: [string, string][] = [
  ['Torna 1', 'Torna'], ['Torna 2', 'Torna'], ['3 Eksen İşleme Merkezi', '3 Eksen'], ['4 Eksen İşleme Merkezi', '4 Eksen'],
];
export const UNITS = ['adet', 'kg', 'gr', 'lt', 'metre', 'paket', 'takım'];
export const PRODUCT_CATEGORIES = ['Metal Ürün', 'Yedek Parça', 'Makine', 'Diğer'];
export const PRODUCT_STATUSES = ['Aktif', 'Pasif'];
export const INCOME_CATEGORIES = ['Satış', 'Hizmet', 'Faiz', 'Diğer Gelir'];
export const EXPENSE_CATEGORIES = ['Malzeme', 'Kira', 'Personel', 'Enerji', 'Bakım', 'Vergi', 'Nakliye', 'Diğer Gider'];
export const ORDER_STATUSES = ['Bekliyor', 'Üretimde', 'Tamamlandı', 'İptal'];
export const SALE_STATUSES = ['Bekliyor', 'Ödendi'];
export const CUSTOMER_STATUSES = ['Aktif', 'Pasif'];
export const TABLES_FOR_RESET = [
  'plan_overrides', 'transactions', 'sales', 'work_orders', 'product_materials', 'product_operations',
  'products', 'stock_movements', 'stock_items', 'customers',
];
export const BACKUP_TABLES = ['settings', 'customers', 'products', 'stock_items', 'stock_movements',
  'product_materials', 'product_operations', 'sales', 'transactions', 'work_orders', 'machines', 'plan_overrides'];
