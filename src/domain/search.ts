import { trLower } from './format';
/** Boşsa her şeyi eşler; Türkçe büyük/küçük harf duyarsız "içerir" araması. */
export function matches(q: string, ...vals: unknown[]): boolean {
  const t = q.trim();
  return !t || trLower(vals.map((v) => String(v ?? '')).join(' ')).includes(trLower(t));
}
