/** Üretim planı hesapları (core/planning.py karşılığı). Tarihler yerel gün olarak Date taşır. */
const EPS = 1e-9;

export interface Chunk { day: Date; minutes: number }

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
/** Pazartesi = 0 ... Pazar = 6 */
export function weekdayIdx(d: Date): number {
  return (d.getDay() + 6) % 7;
}
export function isWorkday(d: Date, weekDays: number): boolean {
  return weekdayIdx(d) < weekDays;
}
export function nextWorkday(d: Date, weekDays: number): Date {
  let x = d;
  while (!isWorkday(x, weekDays)) x = addDays(x, 1);
  return x;
}
export function buffered(minutes: number, bufferPct: number): number {
  return Number(minutes || 0) * (1 + Number(bufferPct || 0) / 100);
}
export function perDay(capMin: number, unitMin: number): number {
  return unitMin > 0 ? Math.floor(capMin / unitMin + EPS) : 0;
}
export function perWeek(capMin: number, weekDays: number, unitMin: number): number {
  return unitMin > 0 ? Math.floor((capMin * weekDays) / unitMin + EPS) : 0;
}

export interface Allocation { start: Date | null; end: Date; chunks: Chunk[]; day: Date; used: number }

/** totalMin dakikalık işi `day` gününden (o gün `used` dk dolu) başlayarak günlük kapasiteye dağıtır. */
export function allocate(totalMin: number, dayIn: Date, usedIn: number, capMin: number, weekDays: number): Allocation {
  let day = nextWorkday(dayIn, weekDays);
  let used = usedIn;
  if (totalMin <= EPS || capMin <= 0) return { start: day, end: day, chunks: [], day, used };
  let left = totalMin;
  const chunks: Chunk[] = [];
  let start: Date | null = null;
  let end = day;
  while (left > EPS) {
    day = nextWorkday(day, weekDays);
    const avail = capMin - used;
    if (avail <= EPS) {
      day = addDays(day, 1);
      used = 0;
      continue;
    }
    const take = Math.min(avail, left);
    chunks.push({ day, minutes: take });
    start = start ?? day;
    end = day;
    used += take;
    left -= take;
  }
  return { start, end, chunks, day, used };
}

export function unitsDoneByDay(chunks: Chunk[], unitMin: number): number[] {
  let cum = 0;
  return chunks.map((c) => {
    cum += c.minutes;
    return unitMin > 0 ? Math.floor(cum / unitMin + EPS) : 0;
  });
}
export function remainingUnits(qty: number, progress: number): number {
  return Math.max(0, Math.ceil((Number(qty || 0) * (100 - Number(progress || 0))) / 100 - EPS));
}

export interface PlanParams { hours: number; workers: number; weekDays: number; buffer: number; cap: number }
export function planParams(S: Record<string, string>): PlanParams {
  const hours = Number(S.plan_daily_hours || 8) || 8;
  const workers = Math.max(1, Math.floor(Number(S.plan_workers || 1) || 1));
  return {
    hours, workers,
    weekDays: Math.floor(Number(S.plan_week_days || 5)) || 5,
    buffer: Number(S.plan_buffer_pct || 0) || 0,
    cap: hours * 60 * workers,
  };
}

export interface ScheduleOrderIn {
  id: number; code: string; quantity: number; progress: number; due_date: string | null; unit_minutes: number;
}
export interface ScheduleRow<T extends ScheduleOrderIn> {
  w: T; rem: number; need: number; start: Date | null; end: Date | null; state: 'Zamanında' | 'Gecikir' | 'Operasyon yok';
}
/** Açık siparişleri termin sırasına göre tek hat olarak planlar. */
export function scheduleOrders<T extends ScheduleOrderIn>(orders: T[], P: PlanParams, from: Date): ScheduleRow<T>[] {
  const out: ScheduleRow<T>[] = [];
  let day = from;
  let used = 0;
  const sorted = [...orders].sort((a, b) => {
    const da = a.due_date || '9999', db = b.due_date || '9999';
    return da < db ? -1 : da > db ? 1 : a.id - b.id;
  });
  for (const w of sorted) {
    const unit = buffered(w.unit_minutes, P.buffer);
    const rem = remainingUnits(w.quantity, w.progress);
    const need = rem * unit;
    if (unit <= 0) {
      out.push({ w, rem, need: 0, start: null, end: null, state: 'Operasyon yok' });
      continue;
    }
    const a = allocate(need, day, used, P.cap, P.weekDays);
    day = a.day;
    used = a.used;
    const endISO = a.end.getFullYear() * 10000 + (a.end.getMonth() + 1) * 100 + a.end.getDate();
    const due = w.due_date ? Number(w.due_date.slice(0, 10).replace(/-/g, '')) : 0;
    out.push({ w, rem, need, start: a.start, end: a.end, state: due && endISO > due ? 'Gecikir' : 'Zamanında' });
  }
  return out;
}
