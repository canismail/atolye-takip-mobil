import assert from 'node:assert/strict';
import { openNodeDb } from '../server/sqliteAdapter';
import { initDb } from '../src/db/migrate';
import { createRepo } from '../src/repo';
import { calcUnitWeight, hammaddeUnitCost, stockStatus, sizeLabel } from '../src/domain/weight';
import { num, money, parseNum, trLower, trAscii, dmy, numInput } from '../src/domain/format';
import * as pl from '../src/domain/planning';
import { statusForProgress } from '../src/repo/orders';
import * as mp from '../src/domain/machinePlan';

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

async function fresh() {
  const db = openNodeDb();
  await initDb(db);
  return createRepo(db);
}

test('format: Türkçe sayı / para / tarih', async () => {
  assert.equal(num(1234.5), '1.234,5');
  assert.equal(num(0), '0');
  assert.equal(num(1234567.891), '1.234.567,89');
  assert.equal(num(-0.001), '0');
  assert.equal(num(3, 0), '3');
  assert.equal(money(-1500), '-₺1.500');
  assert.equal(money(250.5, true), '+₺250,5');
  assert.equal(parseNum('1.250,5'), 1250.5);
  assert.equal(parseNum('1250.5'), 1250.5);
  assert.equal(parseNum(''), 0);
  assert.equal(numInput(7.85), '7,85');
  assert.equal(trLower('IŞIK İş'), 'ışık iş');
  assert.equal(trAscii('Şaft Çelik'), 'Saft Celik');
  assert.equal(dmy('2026-10-02'), '02.10.2026');
});

test('ağırlık: 30x40x50 mm 1040 = 0,471 kg; Ø30x50 yuvarlak', async () => {
  close(calcUnitWeight('rect', 30, 40, 50, 7.85), 0.471);
  close(calcUnitWeight('round', 30, 0, 50, 7.85), (Math.PI / 4 * 900 * 50) / 1e6 * 7.85);
  assert.equal(calcUnitWeight(null, 30, 40, 50, 7.85), 0);
  // boru: Ø40×3, 1 m, çelik → 2,74 kg (tablo değeri); Ø48,3×3,2 → 3,56 kg/m; et = çap/2 → dolu çubuk
  close(calcUnitWeight('pipe', 40, 3, 1000, 7.85), 2.7374, 0.001);
  close(calcUnitWeight('pipe', 48.3, 3.2, 1000, 7.85), 3.5589, 0.001);
  close(calcUnitWeight('pipe', 20, 10, 100, 7.85), calcUnitWeight('round', 20, 0, 100, 7.85));
  assert.equal(calcUnitWeight('pipe', 20, 11, 100, 7.85), 0);
  assert.equal(calcUnitWeight('pipe', 20, 0, 100, 7.85), 0);
  assert.equal(sizeLabel({ shape: 'pipe', dim_a: 40, dim_b: 3, length_mm: 1000 }), 'Boru Ø40x3 x 1.000 mm');
  close(hammaddeUnitCost('adet', 0.471, 50), 23.55);
  assert.equal(hammaddeUnitCost('kg', 0, 50), 50);
  assert.equal(sizeLabel({ shape: 'rect', dim_a: 30, dim_b: 40, length_mm: 50 }), '30x40 x 50 mm');
  assert.equal(sizeLabel({ shape: 'round', dim_a: 30, dim_b: 0, length_mm: 50 }), 'Ø30 x 50 mm');
  assert.equal(stockStatus(5, 10, 20), 'Kritik');
  assert.equal(stockStatus(11, 10, 20), 'Minimuma Yakın');
  assert.equal(stockStatus(50, 10, 20), 'Normal');
  assert.equal(stockStatus(0, 0, 20), 'Normal');
});

test('migrasyon: eski şema yükseltilir, eski kategoriler Diğer olur', async () => {
  const db = openNodeDb();
  await db.exec(`CREATE TABLE stock_items (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Hammadde', unit TEXT NOT NULL DEFAULT 'adet',
    quantity REAL NOT NULL DEFAULT 0, min_qty REAL NOT NULL DEFAULT 0, unit_cost REAL NOT NULL DEFAULT 0,
    location TEXT, created_at TEXT NOT NULL DEFAULT (date('now','localtime')));
    CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Metal Ürün', icon TEXT NOT NULL DEFAULT '📦', unit_price REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Aktif', description TEXT, created_at TEXT NOT NULL DEFAULT (date('now','localtime')));
    INSERT INTO stock_items(code,name,category) VALUES ('A-01','Cıvata','Sarf');`);
  await initDb(db);
  const r = createRepo(db);
  const items = await r.stock.list();
  assert.equal(items[0].category, 'Diğer');
  assert.equal(items[0].in_stock, 1);
  assert.equal(items[0].unit_weight, 0);
  const cols = (await db.all<{ name: string }>('PRAGMA table_info(products)')).map((c) => c.name);
  assert.ok(cols.includes('image'));
  await initDb(db); // ikinci çalıştırma zararsız
  assert.equal((await r.settings.get('plan_buffer_pct')), '15');
});

test('hammadde: ağırlık, birim maliyet ve yoğunluk değişince yeniden hesap', async () => {
  const r = await fresh();
  const id = await r.stock.saveMaterial({ name: 'Mil 30x40', category: 'Hammadde', unit: 'kg', min_qty: 0, unit_cost: 0,
    shape: 'rect', dim_a: 30, dim_b: 40, length_mm: 50, grade: '1040 (Çelik)', kg_price: 50 });
  let it = (await r.stock.get(id))!;
  assert.equal(it.code, 'MIL-01');
  assert.equal(it.unit, 'adet'); // ölçülü hammadde parça olarak takip edilir
  close(it.unit_weight, 0.471);
  close(it.unit_cost, 23.55);
  assert.equal(it.in_stock, 0); // otomatik stoğa girmez
  assert.equal(it.size, '30x40 x 50 mm');
  const types = await r.settings.materialTypes();
  types.find((t) => t.name === '1040 (Çelik)')!.density = 8;
  await r.settings.setMaterialTypes(types);
  assert.equal(await r.stock.recalcHammadde(), 1);
  it = (await r.stock.get(id))!;
  close(it.unit_weight, 0.48);
  close(it.unit_cost, 24);
  // hammadde dışı: elle maliyet, ölçü alanları temizlenir
  const id2 = await r.stock.saveMaterial({ name: 'Rulman', category: 'Yedek Parça', unit: 'adet', min_qty: 5, unit_cost: 120 });
  const it2 = (await r.stock.get(id2))!;
  assert.equal(it2.unit_cost, 120);
  assert.equal(it2.shape, null);
  assert.equal(it2.unit_weight, 0);
  // ölçüsüz hammadde: kg fiyatı = birim maliyet
  const id3 = await r.stock.saveMaterial({ name: 'Boya', category: 'Hammadde', unit: 'kg', min_qty: 0, unit_cost: 0,
    shape: 'rect', dim_a: 0, dim_b: 0, length_mm: 0, grade: '1040 (Çelik)', kg_price: 80 });
  const it3 = (await r.stock.get(id3))!;
  assert.equal(it3.unit, 'kg');
  assert.equal(it3.unit_cost, 80);
});

test('kod üretimi: isimden, Türkçe karakterli, çakışmasız', async () => {
  const r = await fresh();
  const mk = (name: string) => r.stock.saveMaterial({ name, category: 'Diğer', unit: 'adet', min_qty: 0, unit_cost: 0 });
  const a = await mk('Masa Ayağı'), b = await mk('Masa Üstü'), c = await mk('Şaft');
  assert.equal((await r.stock.get(a))!.code, 'MASA-01');
  assert.equal((await r.stock.get(b))!.code, 'MASA-02');
  assert.equal((await r.stock.get(c))!.code, 'SAFT-01');
});

test('boş isim reddedilir', async () => {
  const r = await fresh();
  await assert.rejects(() => r.stock.saveMaterial({ name: '  ', category: 'Diğer', unit: 'adet', min_qty: 0, unit_cost: 0 }));
});

test('stok yaşam döngüsü: bileşen otomatik görünmez, hareketler, kaldırma', async () => {
  const r = await fresh();
  const id = await r.stock.saveMaterial({ name: 'Vida', category: 'Diğer', unit: 'adet', min_qty: 10, unit_cost: 2 });
  assert.equal((await r.stock.list({ inStock: true })).length, 0);
  await r.stock.addToStock(id, 8, '', '2026-10-01');
  let it = (await r.stock.get(id))!;
  assert.equal(it.in_stock, 1);
  assert.equal(it.quantity, 8);
  assert.equal(it.status, 'Kritik');
  assert.equal(it.value, 16);
  await r.stock.addMovement(id, -3, 'Üretime çıkış', '2026-10-02');
  it = (await r.stock.get(id))!;
  assert.equal(it.quantity, 5);
  const mv = await r.stock.movements(id);
  assert.equal(mv.length, 2);
  assert.equal(mv[0].change, -3);
  assert.equal(await r.stock.stockValue(), 10);
  assert.match((await r.stock.removeFromStock(id))!, /miktar var/);
  await r.stock.addMovement(id, -5);
  assert.equal(await r.stock.removeFromStock(id), null);
  assert.equal((await r.stock.get(id))!.in_stock, 0);
});

test('ürün: reçete, operasyon, sıralama, stoğa ekleme, silme kuralları', async () => {
  const r = await fresh();
  const m1 = await r.stock.saveMaterial({ name: 'Boru', category: 'Hammadde', unit: 'adet', min_qty: 0, unit_cost: 0,
    shape: 'round', dim_a: 20, length_mm: 100, grade: 'Paslanmaz 304', kg_price: 100 });
  const m2 = await r.stock.saveMaterial({ name: 'Conta', category: 'Diğer', unit: 'adet', min_qty: 0, unit_cost: 5 });
  const pid = await r.products.save({ name: 'Su Başlığı', category: 'Metal Ürün', icon: '🚰', unit_price: 500,
    status: 'Aktif', description: '' });
  assert.equal((await r.products.get(pid))!.code, 'SU-01');
  await r.products.saveMaterialRow(pid, m1, 1);
  await r.products.saveMaterialRow(pid, m2, 2);
  await r.products.saveMaterialRow(pid, m2, 1); // aynı bileşen: miktar toplanır
  const mats = await r.products.materials(pid);
  assert.equal(mats.length, 2);
  assert.equal(mats[1].quantity, 3);
  const w = calcUnitWeight('round', 20, 0, 100, 7.93);
  close((await r.products.get(pid))!.material_cost, w * 100 + 15);
  await r.products.saveOperation(pid, 'Kesim', 10);
  await r.products.saveOperation(pid, 'Tornalama', 25);
  await r.products.saveOperation(pid, 'Montaj', 5);
  let ops = await r.products.operations(pid);
  assert.deepEqual(ops.map((o) => o.name), ['Kesim', 'Tornalama', 'Montaj']);
  await r.products.moveRow('product_operations', pid, ops[2].id, -1);
  ops = await r.products.operations(pid);
  assert.deepEqual(ops.map((o) => o.name), ['Kesim', 'Montaj', 'Tornalama']);
  await r.products.moveRow('product_operations', pid, ops[0].id, -1); // sınırda: değişmez
  await r.products.removeRow('product_operations', pid, ops[1].id);
  ops = await r.products.operations(pid);
  assert.deepEqual(ops.map((o) => [o.name, o.seq]), [['Kesim', 1], ['Tornalama', 2]]);
  assert.equal((await r.products.get(pid))!.total_minutes, 35);
  // reçetedeki bileşen silinemez
  assert.match((await r.stock.remove(m1)).error!, /reçetesinde/);
  // ürünü stoğa ekle
  const sid = await r.stock.addProductToStock(pid, 4, '', '2026-10-01');
  let item = (await r.stock.get(sid))!;
  assert.equal(item.code, 'URN-SU-01');
  assert.equal(item.quantity, 4);
  assert.equal(item.in_stock, 1);
  assert.equal(item.product_id, pid);
  assert.equal((await r.stock.list({ inStock: true })).length, 0); // ürün satırı varsayılan listede yok
  assert.equal((await r.stock.list({ inStock: true, withProducts: true })).length, 1);
  assert.equal(await r.stock.addProductToStock(pid), sid); // ikinci kez aynı satır
  // sipariş varken ürün silinemez
  await r.orders.save({ customer_id: null, product_id: pid, quantity: 1, due_date: null, progress: 0, status: 'Bekliyor', note: '' });
  assert.match((await r.products.remove(pid)).error!, /silinemez/);
  const pid2 = await r.products.save({ name: 'Geçici', category: 'Diğer', icon: '📦', unit_price: 1, status: 'Aktif', description: '' });
  await r.stock.addProductToStock(pid2);
  assert.equal((await r.products.remove(pid2)).error, null);
  assert.equal((await r.stock.list({ withProducts: true })).filter((s) => s.product_id === pid2).length, 0);
});

test('satış → gelir senkronu', async () => {
  const r = await fresh();
  const cid = await r.customers.save({ name: 'Yılmaz Makine', contact: '', phone: '', email: '', address: '', tax_no: '', status: 'Aktif' });
  const pid = await r.products.save({ name: 'Flanş', category: 'Metal Ürün', icon: '📦', unit_price: 100, status: 'Aktif', description: '' });
  const base = { date: '2026-10-01', customer_id: cid, product_id: pid, quantity: 5, unit_price: 100, amount: 500,
    status: 'Bekliyor', due_date: '2026-09-20', paid_date: null, note: '' };
  const sid = await r.sales.save(base);
  const sale = (await r.sales.list())[0];
  assert.equal(sale.code, 'S-1001');
  assert.equal((await r.sales.transactions()).length, 0);
  assert.equal(await r.metrics.receivables(), 500);
  assert.equal(await r.metrics.overdueReceivables(), 500);
  await r.sales.markPaid(sid, '2026-10-03');
  let tx = await r.sales.transactions();
  assert.equal(tx.length, 1);
  assert.deepEqual([tx[0].type, tx[0].category, tx[0].amount, tx[0].date, tx[0].doc_no], ['Gelir', 'Satış', 500, '2026-10-03', 'S-1001']);
  assert.equal(await r.metrics.receivables(), 0);
  await r.sales.save({ ...base, status: 'Ödendi', amount: 450, paid_date: '2026-10-03' }, sid);
  tx = await r.sales.transactions();
  assert.equal(tx.length, 1);
  assert.equal(tx[0].amount, 450);
  await r.sales.markPending(sid);
  assert.equal((await r.sales.transactions()).length, 0);
  assert.equal((await r.sales.list())[0].paid_date, null);
  await r.sales.markPaid(sid);
  await r.sales.remove(sid);
  assert.equal((await r.sales.transactions()).length, 0);
  assert.equal((await r.sales.list()).length, 0);
  // Ödendi + tarih yoksa bugün atanır
  const sid2 = await r.sales.save({ ...base, status: 'Ödendi' });
  assert.ok((await r.sales.list())[0].paid_date);
  assert.equal((await r.sales.list())[0].code, 'S-1001'); // silinen kodun numarası yeniden kullanılır (masaüstü ile aynı)
  void sid2;
  // müşteri / ürün bağlıyken silinemez
  assert.match((await r.customers.remove(cid))!, /silinemez/);
  const cs = (await r.customers.withStats())[0];
  assert.equal(cs.total_sales, 500);
  assert.equal(cs.balance, 0);
});

test('müşteri doğrulama ve silme', async () => {
  const r = await fresh();
  await assert.rejects(() => r.customers.save({ name: 'X', contact: '', phone: '', email: 'bozuk', address: '', tax_no: '', status: 'Aktif' }), /E-posta/);
  const cid = await r.customers.save({ name: 'Boş Müşteri', contact: '', phone: '', email: 'a@b.co', address: '', tax_no: '', status: 'Aktif' });
  assert.equal((await r.customers.get(cid))!.code, 'BOS-01');
  await r.customers.setStatus(cid, 'Pasif');
  assert.equal((await r.customers.get(cid))!.status, 'Pasif');
  assert.equal(await r.customers.remove(cid), null);
});

test('iş emirleri: kod, durum/ilerleme kuralları', async () => {
  const r = await fresh();
  const pid = await r.products.save({ name: 'Mil', category: 'Metal Ürün', icon: '📦', unit_price: 1, status: 'Aktif', description: '' });
  await r.products.saveOperation(pid, 'Torna', 30);
  const wid = await r.orders.save({ customer_id: null, product_id: pid, quantity: 10, due_date: '2026-10-10', progress: 0, status: 'Bekliyor', note: '' });
  let w = (await r.orders.list())[0];
  assert.equal(w.code, 'SIP-1001');
  assert.equal(w.unit_minutes, 30);
  await r.orders.updateProgress(wid, 40);
  w = (await r.orders.list())[0];
  assert.deepEqual([w.status, w.progress, w.completed_at], ['Üretimde', 40, null]);
  await r.orders.updateProgress(wid, 100);
  w = (await r.orders.list())[0];
  assert.equal(w.status, 'Tamamlandı');
  assert.ok(w.completed_at);
  await r.orders.updateProgress(wid, 50);
  w = (await r.orders.list())[0];
  assert.deepEqual([w.status, w.completed_at], ['Üretimde', null]);
  await r.orders.cancel(wid);
  assert.equal((await r.orders.list())[0].status, 'İptal');
  await r.orders.reopen(wid);
  assert.equal((await r.orders.list())[0].status, 'Üretimde');
  // Tamamlandı kaydı ilerlemeyi 100 yapar
  await r.orders.save({ customer_id: null, product_id: pid, quantity: 1, due_date: null, progress: 10, status: 'Tamamlandı', note: '' }, wid);
  w = (await r.orders.list())[0];
  assert.deepEqual([w.progress, w.status], [100, 'Tamamlandı']);
  // tamamlanan sipariş stoktan otomatik düşmez (istenmedi)
  assert.equal(statusForProgress(0, 'İptal'), 'İptal');
  assert.equal((await r.orders.list()).length, 1);
  assert.equal((await r.orders.save({ customer_id: null, product_id: pid, quantity: 1, due_date: null, progress: 0, status: 'Bekliyor', note: '' })) > 0, true);
  assert.equal((await r.orders.list()).find((x) => x.id !== wid)!.code, 'SIP-1002');
});

test('planlama: Python ile aynı sonuçlar', async () => {
  assert.equal(pl.perDay(480, 46), 10);
  assert.equal(pl.perWeek(480, 5, 46), 52);
  assert.equal(pl.perWeek(480, 6, 46), 62);
  const P = pl.planParams({ plan_daily_hours: '8', plan_week_days: '5', plan_buffer_pct: '15', plan_workers: '1' });
  assert.equal(P.cap, 480);
  const orders = [
    { id: 1, code: 'A', quantity: 10, progress: 0, due_date: '2026-10-05', unit_minutes: 40 },
    { id: 2, code: 'B', quantity: 5, progress: 20, due_date: '2026-10-20', unit_minutes: 100 },
  ];
  const sch = pl.scheduleOrders(orders, P, new Date(2026, 9, 2)); // Cuma
  assert.equal(sch[0].rem, 10);
  close(sch[0].need, 460);
  assert.equal(dmy(sch[0].end!), '02.10.2026');
  assert.equal(sch[0].state, 'Zamanında');
  assert.equal(sch[1].rem, 4);
  assert.equal(dmy(sch[1].start!), '02.10.2026');
  assert.equal(dmy(sch[1].end!), '05.10.2026'); // hafta sonu atlanır
  const a = pl.allocate(460, new Date(2026, 9, 2), 0, 480, 5);
  const b = pl.allocate(460, a.day, a.used, 480, 5);
  assert.deepEqual(b.chunks.map((c) => [dmy(c.day), Math.round(c.minutes)]), [['02.10.2026', 20], ['05.10.2026', 440]]);
  assert.deepEqual(pl.unitsDoneByDay(b.chunks, 115), [0, 4]);
  // geç kalan sipariş
  const late = pl.scheduleOrders([{ ...orders[0], due_date: '2026-10-01' }], P, new Date(2026, 9, 2));
  assert.equal(late[0].state, 'Gecikir');
  // operasyonu olmayan
  assert.equal(pl.scheduleOrders([{ ...orders[0], unit_minutes: 0 }], P, new Date())[0].state, 'Operasyon yok');
  assert.equal(pl.isWorkday(new Date(2026, 9, 3), 5), false); // Cumartesi
  assert.equal(pl.isWorkday(new Date(2026, 9, 3), 6), true);
  assert.equal(pl.remainingUnits(10, 100), 0);
});

test('metrikler: aylık özet, üretim saati, stok devir, en çok satanlar', async () => {
  const r = await fresh();
  const pid = await r.products.save({ name: 'Flanş', category: 'Metal Ürün', icon: '📦', unit_price: 100, status: 'Aktif', description: '' });
  const m = await r.stock.saveMaterial({ name: 'Sac', category: 'Diğer', unit: 'adet', min_qty: 0, unit_cost: 10 });
  await r.products.saveMaterialRow(pid, m, 2);
  await r.stock.addToStock(m, 100);
  await r.products.saveOperation(pid, 'Kesim', 30);
  const wid = await r.orders.save({ customer_id: null, product_id: pid, quantity: 4, due_date: null, progress: 50, status: 'Üretimde', note: '' });
  void wid;
  const key = '2026-10';
  close(await r.metrics.productionHours(key), 1); // 4*30*0.5/60
  await r.sales.save({ date: '2026-10-05', customer_id: null, product_id: pid, quantity: 3, unit_price: 100, amount: 300, status: 'Ödendi', due_date: null, paid_date: '2026-10-06', note: '' });
  await r.sales.save({ date: '2026-10-07', customer_id: null, product_id: pid, quantity: 1, unit_price: 100, amount: 100, status: 'Bekliyor', due_date: null, paid_date: null, note: '' });
  await r.sales.saveTransaction({ date: '2026-10-08', type: 'Gider', category: 'Malzeme', description: 'Sac', doc_no: '', amount: 80 });
  await r.sales.saveTransaction({ date: '2026-10-09', type: 'Gider', category: 'Personel', description: '', doc_no: '', amount: 50 });
  await r.sales.saveTransaction({ date: '2026-10-10', type: 'Gider', category: 'Kira', description: '', doc_no: '', amount: 20 });
  assert.equal(await r.metrics.salesTotal({ month: key }), 400);
  assert.equal(await r.metrics.salesTotal({ month: key, status: 'Ödendi' }), 300);
  assert.equal(await r.metrics.salesCount(key), 2);
  assert.equal(await r.metrics.txTotal('Gelir', { month: key }), 300);
  assert.equal(await r.metrics.net({ year: '2026' }), 150);
  const ms = await r.metrics.monthlySummary('2026');
  assert.deepEqual([ms[9].income, ms[9].production, ms[9].personnel, ms[9].other, ms[9].net], [300, 80, 50, 20, 150]);
  const ys = await r.metrics.monthlySales('2026');
  assert.equal(ys[9], 400);
  const top = await r.metrics.topProducts('2026', 5);
  assert.deepEqual([top[0].name, top[0].qty, top[0].revenue], ['Flanş', 4, 400]);
  assert.ok((await r.metrics.stockTurnover('2026')) > 0);
  assert.equal(await r.metrics.stockValue(), 1000);
  assert.ok((await r.metrics.yearsWithData()).includes('2026'));
  assert.ok((await r.metrics.monthsWithData()).includes(key));
});

test('yardımcı sorgular: sayımlar, ürün stok satırı, kullanılan kategoriler', async () => {
  const r = await fresh();
  const pid = await r.products.save({ name: 'Flanş', category: 'Metal Ürün', icon: '📦', unit_price: 1, status: 'Aktif', description: '' });
  await r.customers.save({ name: 'ABC', contact: '', phone: '', email: '', address: '', tax_no: '', status: 'Aktif' });
  const c = await r.metrics.counts(r.metrics.thisMonth());
  assert.deepEqual(c, { products: 1, newProducts: 1, customers: 1 });
  assert.equal(await r.stock.forProduct(pid), null);
  const sid = await r.stock.addProductToStock(pid, 2);
  const fp = await r.stock.forProduct(pid);
  assert.deepEqual([fp!.id, fp!.quantity, fp!.in_stock], [sid, 2, 1]);
  await r.sales.saveTransaction({ date: '2026-10-01', type: 'Gider', category: 'Özel Kategori', description: '', doc_no: '', amount: 5 });
  assert.deepEqual(await r.sales.usedCategories('Gider'), ['Özel Kategori']);
  await assert.rejects(() => r.sales.saveTransaction({ date: '2026-10-01', type: 'Gelir', category: 'Satış', description: '', doc_no: '', amount: 0 }), /Tutar/);
});

test('yedek: dışa aktar → sıfırla → içe aktar', async () => {
  const r = await fresh();
  const pid = await r.products.save({ name: 'Flanş', category: 'Metal Ürün', icon: '📦', unit_price: 100, status: 'Aktif', description: 'x' });
  const m = await r.stock.saveMaterial({ name: 'Sac', category: 'Diğer', unit: 'adet', min_qty: 0, unit_cost: 10 });
  await r.products.saveMaterialRow(pid, m, 2);
  await r.stock.addToStock(m, 7);
  await r.sales.save({ date: '2026-10-05', customer_id: null, product_id: pid, quantity: 3, unit_price: 100, amount: 300, status: 'Ödendi', due_date: null, paid_date: '2026-10-06', note: '' });
  await r.settings.set({ company_name: 'Test A.Ş.' });
  const file = JSON.parse(JSON.stringify(await r.backup.exportAll()));
  await r.backup.resetAll();
  assert.equal((await r.products.withStats()).length, 0);
  assert.equal((await r.sales.transactions()).length, 0);
  await r.backup.importAll(file);
  assert.equal((await r.products.withStats()).length, 1);
  assert.equal((await r.stock.get(m))!.quantity, 7);
  assert.equal((await r.sales.transactions()).length, 1);
  assert.equal((await r.settings.get('company_name')), 'Test A.Ş.');
  assert.equal((await r.products.materials(pid))[0].quantity, 2);
  await assert.rejects(() => r.backup.importAll({ app: 'baska' } as any));
  // başarısız içe aktarma mevcut veriyi bozmaz
  const bad = JSON.parse(JSON.stringify(file));
  bad.tables.sales.push({ id: 99, code: 'S-1001' }); // tekrarlı kod → UNIQUE hatası
  await assert.rejects(() => r.backup.importAll(bad));
  assert.equal((await r.products.withStats()).length, 1);
  assert.equal((await r.sales.list()).length, 1);
  // sıfırlamadan sonra kodlar yeniden başlar
  await r.backup.resetAll();
  const pid2 = await r.products.save({ name: 'Flanş', category: 'Metal Ürün', icon: '📦', unit_price: 1, status: 'Aktif', description: '' });
  assert.equal(pid2, 1);
});

test('boru kesiti: kayıt, ağırlık, maliyet, yeniden hesap, geçersiz et kalınlığı', async () => {
  const r = await fresh();
  const id = await r.stock.saveMaterial({ name: 'Boru 40x3', category: 'Hammadde', unit: 'kg', min_qty: 0, unit_cost: 0,
    shape: 'pipe', dim_a: 40, dim_b: 3, length_mm: 1000, grade: '1050 (Çelik)', kg_price: 30 });
  let it = (await r.stock.get(id))!;
  close(it.unit_weight, 2.7374, 0.001);
  close(it.unit_cost, 2.7374 * 30, 0.05);
  assert.equal(it.unit, 'adet');
  assert.equal(it.size, 'Boru Ø40x3 x 1.000 mm');
  assert.equal(it.dim_b, 3);
  await assert.rejects(() => r.stock.saveMaterial({ name: 'Kalın', category: 'Hammadde', unit: 'adet', min_qty: 0, unit_cost: 0,
    shape: 'pipe', dim_a: 20, dim_b: 11, length_mm: 100, grade: '1050 (Çelik)', kg_price: 1 }), /et kalınlığı/);
  await assert.rejects(() => r.stock.saveMaterial({ name: 'Kalınsız', category: 'Hammadde', unit: 'adet', min_qty: 0, unit_cost: 0,
    shape: 'pipe', dim_a: 20, dim_b: 0, length_mm: 100, grade: '1050 (Çelik)', kg_price: 1 }), /et kalınlığı/);
  await r.settings.setMaterialTypes([{ name: '1050 (Çelik)', density: 8 }]);
  await r.stock.recalcHammadde();
  it = (await r.stock.get(id))!;
  close(it.unit_weight, 2.7374 * 8 / 7.85, 0.001);
});

test('1050 (Çelik) malzeme cinsi: yeni kurulumda var, eski veritabanına bir kez eklenir, silinirse dönmez', async () => {
  const db = openNodeDb();
  await initDb(db);
  const r = createRepo(db);
  assert.ok((await r.settings.materialTypes()).some((t) => t.name === '1050 (Çelik)' && t.density === 7.85));
  // eski veritabanı: 1050'siz liste, bayrak yok
  await r.settings.setMaterialTypes([{ name: '1040 (Çelik)', density: 7.85 }, { name: 'Alüminyum', density: 2.7 }]);
  await db.run("DELETE FROM settings WHERE key='seed_mt_1050'");
  await initDb(db);
  assert.deepEqual((await r.settings.materialTypes()).map((t) => t.name), ['1040 (Çelik)', '1050 (Çelik)', 'Alüminyum']);
  await r.settings.setMaterialTypes([{ name: 'Alüminyum', density: 2.7 }]);
  await initDb(db);
  assert.deepEqual((await r.settings.materialTypes()).map((t) => t.name), ['Alüminyum']);
});

test('stok değeri: ürün satırı satış fiyatından, malzeme maliyetten', async () => {
  const r = await fresh();
  const pid = await r.products.save({ name: 'Vana', category: 'Metal Ürün', icon: '📦', unit_price: 500, status: 'Aktif', description: '' });
  await r.stock.addProductToStock(pid);
  const row = (await r.stock.forProduct(pid))!;
  await r.stock.addMovement(row.id, 10, 'giriş');
  const m = await r.stock.saveMaterial({ name: 'Cıvata', category: 'Bağlantı', unit: 'adet', min_qty: 0, unit_cost: 25 });
  await r.stock.addToStock(m);
  await r.stock.addMovement(m, 4, 'giriş');
  const rows = await r.stock.list({ inStock: true, withProducts: true });
  assert.equal(rows.find((x) => x.id === row.id)!.value, 5000);
  assert.equal(rows.find((x) => x.id === m)!.value, 100);
  assert.equal(await r.stock.stockValue(), 5100);
  assert.equal(await r.metrics.stockValue(), 5100);
});

test('makineler: varsayılan tohum, kayıt, aktif/pasif, operasyonda makine türü', async () => {
  const r = await fresh();
  const ms = await r.machines.list();
  assert.ok(ms.length >= 4);
  assert.ok((await r.machines.types()).includes('Torna'));
  const id = await r.machines.save({ name: 'Taşlama 1', type: 'Taşlama', daily_hours: 9, active: true, changeover_minutes: 30 });
  await r.machines.setActive(id, false);
  assert.equal((await r.machines.list(true)).some((m) => m.id === id), false);
  await assert.rejects(r.machines.save({ name: '', type: 'x', daily_hours: 8, active: true, changeover_minutes: 0 }));
  const pid = await r.products.save({ name: 'Su Başlığı', category: 'Metal Ürün', icon: '📦', unit_price: 1, status: 'Aktif', description: '' });
  await r.products.saveOperation(pid, 'Tornalama 1', 20, undefined, 'Torna', 15);
  const op = (await r.products.operations(pid))[0];
  assert.equal(op.machine_type, 'Torna');
  assert.equal(op.setup_minutes, 15);
  assert.equal((await r.products.get(pid))!.setup_total, 15);
});

test('makine planı: aşama, sök-tak, elle yerleştirme (Python ile aynı sonuçlar)', async () => {
  const machines = [
    { id: 1, name: 'Torna 1', type: 'Torna', daily_hours: 10, active: 1, changeover_minutes: 120 },
    { id: 2, name: 'Torna 2', type: 'Torna', daily_hours: 10, active: 1, changeover_minutes: 120 },
    { id: 3, name: '3 Eksen', type: '3 Eksen', daily_hours: 10, active: 1, changeover_minutes: 120 },
  ];
  const op = (key: number, name: string, minutes: number, machineType: string) => ({ key, name, minutes, setup: 0, machineType });
  const orders = [{ key: 1, label: 'IE-1', product: 'Su Başlığı', qty: 10, due: null,
    ops: [op(1, 'Tornalama 1', 20, 'Torna'), op(2, 'Tornalama 2', 15, 'Torna'), op(3, 'Dik işleme', 10, '3 Eksen'), op(4, 'Tornalama 3', 5, 'Torna')] }];
  const plan = mp.schedulePlan(orders, machines, new Date(2026, 9, 5), 5, 0);
  const it = plan.orders[0].items;
  const by = (n: string) => it.find((x) => x.op === n)!;
  assert.equal(by('Tornalama 1').machine, 'Torna 1');
  assert.equal(mp.clock(by('Tornalama 1').end), '13:20');
  assert.equal(by('Tornalama 2').machine, 'Torna 2');
  assert.equal(mp.clock(by('Tornalama 2').end), '12:30');
  assert.equal(by('Dik işleme').machine, '3 Eksen');
  assert.equal(mp.clock(by('Dik işleme').start), '13:20');
  assert.equal(mp.clock(by('Dik işleme').end), '17:00');
  assert.equal(by('Tornalama 3').machine, 'Torna 1');
  assert.equal(mp.clock(by('Tornalama 3').end), '09:50');
  assert.equal(mp.isoDay(by('Tornalama 3').endDate), '2026-10-06');
  const forced: mp.OverrideMap = new Map([[mp.overrideKey(1, 1), { machineId: 2, day: null }]]);
  const p2 = mp.schedulePlan(orders, machines, new Date(2026, 9, 5), 5, 0, 0, forced);
  assert.equal(p2.orders[0].items.find((x) => x.op === 'Tornalama 1')!.machine, 'Torna 2');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    console.error('  ✗', name, '\n', e);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} test geçti`);
