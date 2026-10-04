/** Makine bazlı üretim planı (masaüstü core/machine_plan.py karşılığı — aynı sonuçları vermelidir).
 *
 * - Operasyon sırası korunur: bir operasyon, önceki operasyonlar bitmeden başlamaz. Arka arkaya gelen ve aynı
 *   makine türündeki operasyonlar bir "aşama" oluşturur; farklı makinelerde aynı anda çalışabilir.
 * - Süre = ayarlama (operasyonda girilmişse o, yoksa makinenin parça ayarlama süresi) + adet × süre × (1 + buffer).
 * - Operasyon, türündeki (boşsa herhangi bir) aktif makineler arasından en erken biteceğine atanır.
 * - Zaman: "iş günü sırası × 1440 + gün içi dakika"; hafta sonları atlanır. */
import { addDays, isWorkday, weekdayIdx } from './planning';

const EPS = 1e-9;
export const DAY = 1440;

export interface MachineIn {
  id: number; name: string; type: string; daily_hours: number; active: number; changeover_minutes?: number | null;
}
export interface OpIn { key: number | null; name: string; minutes: number; setup: number; machineType: string }
export interface OrderIn { key: number; label: string; product: string; qty: number; due: string | null; ops: OpIn[] }
/** (sipariş:operasyon) -> elle yerleştirme */
export type OverrideMap = Map<string, { machineId: number | null; day: string | null }>;
export const overrideKey = (orderKey: number, opKey: number) => `${orderKey}:${opKey}`;

export interface Segment { day: Date; a0: number; a1: number }
export interface PlanItem {
  op: string; opKey: number | null; orderKey: number; stage: number; machine: string; machineId: number; type: string;
  start: number; end: number; startDate: Date; endDate: Date; minutes: number; setup: number; run: number;
  segments: Segment[]; forced: boolean; reqDay: string | null; reqMachine: number | null;
}
export interface PlanOrder {
  key: number; label: string; product: string; qty: number; due: string | null; items: PlanItem[];
  start: Date | null; end: Date | null; startT: number; endT: number; hours: number;
  state: 'Zamanında' | 'Gecikir' | 'Operasyon yok' | 'Makine yok'; blockedOp?: string; blockedType?: string;
}
export interface PlanMachine { id: number; name: string; type: string; dailyHours: number; busy: Map<string, number> }
export interface Plan { orders: PlanOrder[]; machines: PlanMachine[]; end: Date | null; dayOf: (n: number) => Date }

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

class Calendar {
  days: Date[];
  weekDays: number;
  constructor(start: Date, weekDays: number) {
    this.weekDays = weekDays;
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (!isWorkday(d, weekDays)) d = addDays(d, 1);
    this.days = [d];
  }
  dateOf(n: number): Date {
    while (this.days.length <= n) {
      let d = addDays(this.days[this.days.length - 1], 1);
      while (!isWorkday(d, this.weekDays)) d = addDays(d, 1);
      this.days.push(d);
    }
    return this.days[n];
  }
  indexOf(iso: string): number {
    let n = 0;
    while (isoDay(this.dateOf(n)) < iso) n++;
    return n;
  }
}

interface M {
  id: number; name: string; type: string; hours: number; changeover: number; free: number; load: Map<number, number>;
}
const capOf = (m: M) => Math.max(0, m.hours) * 60;

function norm(t: number, cap: number): number {
  const n = Math.floor(t / DAY + EPS);
  return t - n * DAY >= cap - EPS ? (n + 1) * DAY : t;
}

function place(m: M, ready: number, duration: number): { s: number; e: number; segs: { n: number; a0: number; a1: number }[] } {
  const cap = capOf(m);
  const t = norm(Math.max(m.free, ready), cap);
  if (duration <= EPS || cap <= EPS) return { s: t, e: t, segs: [] };
  let left = duration;
  let n = Math.floor(t / DAY + EPS);
  let mi = t - n * DAY;
  const segs: { n: number; a0: number; a1: number }[] = [];
  while (left > EPS) {
    const take = Math.min(cap - mi, left);
    segs.push({ n, a0: mi, a1: mi + take });
    mi += take;
    left -= take;
    if (left > EPS) { n += 1; mi = 0; }
  }
  return { s: t, e: n * DAY + mi, segs };
}

/** Ardışık, aynı makine türündeki operasyonlar tek aşamadır. */
export function stages(ops: OpIn[]): OpIn[][] {
  const out: OpIn[][] = [];
  for (const o of ops) {
    const last = out[out.length - 1];
    if (last && o.machineType !== '' && last[0].machineType === o.machineType) last.push(o);
    else out.push([o]);
  }
  return out;
}

const setupFor = (o: OpIn, qty: number, m: M): number => (qty <= 0 ? 0 : o.setup > 0 ? o.setup : m.changeover);
const durationOf = (o: OpIn, qty: number, buf: number, m: M): number =>
  setupFor(o, qty, m) + qty * o.minutes * (1 + buf / 100);

export function schedulePlan(orders: OrderIn[], machines: MachineIn[], start: Date, weekDays: number, bufferPct = 0,
  day0Offset = 0, overrides: OverrideMap = new Map()): Plan {
  const cal = new Calendar(start, weekDays);
  const ms: M[] = machines
    .filter((m) => m.active && Number(m.daily_hours) > 0)
    .map((m) => ({
      id: m.id, name: m.name, type: m.type || '', hours: Number(m.daily_hours),
      changeover: m.changeover_minutes === null || m.changeover_minutes === undefined ? 120 : Number(m.changeover_minutes),
      free: day0Offset, load: new Map<number, number>(),
    }));
  const result: PlanOrder[] = [];
  const sorted = [...orders].sort((a, b) => {
    const da = a.due || '9999', db = b.due || '9999';
    return da < db ? -1 : da > db ? 1 : String(a.key) < String(b.key) ? -1 : String(a.key) > String(b.key) ? 1 : 0;
  });
  for (const o of sorted) {
    const entry: PlanOrder = { key: o.key, label: o.label, product: o.product, qty: o.qty, due: o.due, items: [],
      start: null, end: null, startT: 0, endT: 0, hours: 0, state: 'Zamanında' };
    if (!o.ops.length || o.ops.reduce((a, x) => a + x.setup + o.qty * x.minutes, 0) <= EPS) {
      entry.state = 'Operasyon yok';
      result.push(entry);
      continue;
    }
    let first: number | null = null, last = 0, ready = 0, blocked: OpIn | null = null;
    let si = 0;
    for (const st of stages(o.ops)) {
      si += 1;
      let stageEnd = ready;
      for (const op of st) {
        const ov = op.key !== null ? overrides.get(overrideKey(o.key, op.key)) : undefined;
        const forced = ov && ov.machineId !== null ? ms.find((m) => m.id === ov.machineId) : undefined;
        const cands = forced ? [forced] : ms.filter((m) => op.machineType === '' || m.type === op.machineType);
        if (!cands.length) { blocked = op; break; }
        let readyOp = ready;
        if (ov && ov.day) readyOp = Math.max(ready, cal.indexOf(ov.day) * DAY);
        let best: { m: M; s: number; e: number; segs: { n: number; a0: number; a1: number }[]; d: number } | null = null;
        for (const m of cands) {
          const d = durationOf(op, o.qty, bufferPct, m);
          const p = place(m, readyOp, d);
          if (!best || p.e < best.e - EPS || (Math.abs(p.e - best.e) <= EPS && p.s < best.s - EPS)) best = { m, ...p, d };
        }
        const { m, s, e, segs, d } = best!;
        m.free = e;
        for (const g of segs) m.load.set(g.n, (m.load.get(g.n) ?? 0) + (g.a1 - g.a0));
        const setup = setupFor(op, o.qty, m);
        entry.items.push({
          op: op.name, opKey: op.key, orderKey: o.key, stage: si, machine: m.name, machineId: m.id, type: op.machineType,
          start: s, end: e, startDate: cal.dateOf(Math.floor(s / DAY + EPS)), endDate: cal.dateOf(Math.floor(e / DAY + EPS)),
          minutes: d, setup, run: d - setup,
          segments: segs.map((g) => ({ day: cal.dateOf(g.n), a0: g.a0, a1: g.a1 })),
          forced: !!(ov && (forced || ov.day)), reqDay: ov?.day ?? null, reqMachine: ov?.machineId ?? null,
        });
        first = first === null ? s : Math.min(first, s);
        last = Math.max(last, e);
        stageEnd = Math.max(stageEnd, e);
      }
      if (blocked) break;
      ready = stageEnd;
    }
    if (blocked) {
      entry.state = 'Makine yok';
      entry.blockedOp = blocked.name;
      entry.blockedType = blocked.machineType;
      result.push(entry);
      continue;
    }
    entry.hours = entry.items.reduce((a, it) => a + it.minutes, 0) / 60;
    entry.startT = first ?? 0;
    entry.endT = last;
    entry.start = cal.dateOf(Math.floor((first ?? 0) / DAY + EPS));
    entry.end = cal.dateOf(Math.floor(last / DAY + EPS));
    if (o.due && isoDay(entry.end) > o.due.slice(0, 10)) entry.state = 'Gecikir';
    result.push(entry);
  }
  const ends = result.filter((e) => e.end).map((e) => e.end as Date);
  return {
    orders: result,
    machines: ms.map((m) => ({
      id: m.id, name: m.name, type: m.type, dailyHours: m.hours,
      busy: new Map([...m.load.entries()].sort((a, b) => a[0] - b[0]).map(([n, v]) => [isoDay(cal.dateOf(n)), v])),
    })),
    end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
    dayOf: (n: number) => cal.dateOf(n),
  };
}

/** Gün içi dakika -> "SS:DD" (vardiya başlangıcı dakika olarak). */
export function hm(minutesInDay: number, shiftStartMin = 8 * 60): string {
  const mm = Math.round(minutesInDay) + shiftStartMin;
  return `${String(Math.floor(mm / 60) % 24).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}
/** Mutlak an -> "SS:DD" */
export function clock(t: number, shiftStartMin = 8 * 60): string {
  return hm(t - Math.floor(t / DAY + EPS) * DAY, shiftStartMin);
}
export function shiftMinutes(S: Record<string, string>): number {
  const [h, m] = String(S.plan_shift_start || '08:00').split(':');
  const v = Number(h) * 60 + Number(m);
  return Number.isFinite(v) ? v : 8 * 60;
}
export { weekdayIdx };
