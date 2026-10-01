import { DEFAULT_DENSITY } from '../db/schema';
import type { MaterialType } from '../db/types';
import { num } from './format';

/** Parça başına kg. Ölçüler mm, yoğunluk g/cm³.
 *  rect: en × boy × uzunluk, round: π/4 × çap² × uzunluk. */
export function calcUnitWeight(shape: string | null | undefined, a: number, b: number, length: number,
  density: number): number {
  if (!shape || !length || !density || !a) return 0;
  const vol = shape === 'round' ? (Math.PI / 4) * a * a * length : a * (b || 0) * length;
  return (vol / 1000) * density / 1000; // mm³ → cm³ → g → kg
}

export function volumeCm3(shape: string, a: number, b: number, length: number): number {
  return ((shape === 'round' ? (Math.PI / 4) * a * a : a * b) * length) / 1000;
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
  return r.shape === 'round' ? `Ø${num(a)} x ${num(ln)} mm` : `${num(a)}x${num(b)} x ${num(ln)} mm`;
}

export function stockStatus(qty: number, minQty: number, nearPct: number): 'Normal' | 'Minimuma Yakın' | 'Kritik' {
  if (minQty > 0 && qty < minQty) return 'Kritik';
  if (minQty > 0 && qty <= minQty * (1 + nearPct / 100)) return 'Minimuma Yakın';
  return 'Normal';
}
