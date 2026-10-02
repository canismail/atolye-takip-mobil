import { DEFAULT_DENSITY } from '../db/schema';
import type { MaterialType } from '../db/types';
import { num } from './format';

/** Hacim (cm³). Ölçüler mm.
 *  rect: en × boy × uzunluk · round: π/4 × çap² × uzunluk ·
 *  pipe (boru): π/4 × (dış çap² − iç çap²) × uzunluk = π × et × (dış çap − et) × uzunluk (iç çap = dış çap − 2 × et).
 *  Boruda et kalınlığı 0'dan büyük ve dış çapın yarısından fazla olamaz (geçersizse 0). */
export function volumeCm3(shape: string | null | undefined, a: number, b: number, length: number): number {
  if (!shape || !length || !a) return 0;
  let vol: number;
  if (shape === 'round') vol = (Math.PI / 4) * a * a * length;
  else if (shape === 'pipe') {
    const t = b || 0;
    if (t <= 0 || 2 * t > a) return 0;
    vol = Math.PI * t * (a - t) * length;
  } else vol = a * (b || 0) * length;
  return vol / 1000; // mm³ → cm³
}

/** Parça başına kg. Ölçüler mm, yoğunluk g/cm³. */
export function calcUnitWeight(shape: string | null | undefined, a: number, b: number, length: number,
  density: number): number {
  if (!density) return 0;
  return (volumeCm3(shape, a, b, length) * density) / 1000; // cm³ → g → kg
}

/** Birim maliyet: ölçülü hammaddede parça ağırlığı × kg fiyatı, ölçü yoksa kg fiyatı. */
export function hammaddeUnitCost(_unit: string, weight: number, kgPrice: number): number {
  return weight > 0 ? weight * kgPrice : kgPrice;
}

export function materialDensity(types: MaterialType[], grade: string | null | undefined,
  fallback = DEFAULT_DENSITY): number {
  return types.find((t) => t.name === grade)?.density ?? fallback;
}

export function sizeLabel(r: { shape: string | null; dim_a: number | null; dim_b: number | null;
  length_mm: number | null }): string {
  if (!r.shape || !r.length_mm) return '';
  const a = r.dim_a || 0, b = r.dim_b || 0, ln = r.length_mm;
  if (r.shape === 'round') return `Ø${num(a)} x ${num(ln)} mm`;
  if (r.shape === 'pipe') return `Boru Ø${num(a)}x${num(b)} x ${num(ln)} mm`;
  return `${num(a)}x${num(b)} x ${num(ln)} mm`;
}

export function stockStatus(qty: number, minQty: number, nearPct: number): 'Normal' | 'Minimuma Yakın' | 'Kritik' {
  if (minQty > 0 && qty < minQty) return 'Kritik';
  if (minQty > 0 && qty <= minQty * (1 + nearPct / 100)) return 'Minimuma Yakın';
  return 'Normal';
}
