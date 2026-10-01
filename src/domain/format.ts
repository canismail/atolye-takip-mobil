/** Biçimlendirme ve tarih yardımcıları (core/utils.py karşılığı). */
const CURRENCY_SYMBOLS: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
export const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos',
  'Eylül', 'Ekim', 'Kasım', 'Aralık'];

let symbol = '₺';
export function setCurrency(code: string): void {
  symbol = CURRENCY_SYMBOLS[code] ?? '₺';
}

/** Türkçe sayı biçimi: 1.234,5 (gereksiz ondalıklar atılır). */
export function num(x: number | null | undefined, decimals = 2): string {
  const v = Number(x ?? 0);
  const fixed = Math.abs(v).toFixed(decimals);
  let [i, f] = fixed.split('.');
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (f) f = f.replace(/0+$/, '');
  const isZero = Number(fixed) === 0;
  return (v < 0 && !isZero ? '-' : '') + i + (f ? ',' + f : '');
}

export function money(x: number | null | undefined, sign = false): string {
  const v = Number(x ?? 0);
  const prefix = v < 0 ? '-' : sign && v > 0 ? '+' : '';
  return `${prefix}${symbol}${num(Math.abs(v))}`;
}

export function pct(x: number | null | undefined, decimals = 1): string {
  return `%${num(x ?? 0, decimals)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function today(): string {
  return toISO(new Date());
}
export function parseISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
export function dmy(s: string | Date | null | undefined): string {
  const d = s instanceof Date ? s : parseISO(s ?? null);
  return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : '-';
}
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS_LONG[Number(m) - 1]} ${y}`;
}
export function prevMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}
export function changePct(cur: number, prev: number): number | null {
  return prev ? ((cur - prev) / Math.abs(prev)) * 100 : null;
}

const TR_LOWER: Record<string, string> = { I: 'ı', İ: 'i' };
export function trLower(s: unknown): string {
  return String(s ?? '').replace(/[Iİ]/g, (c) => TR_LOWER[c]).toLowerCase();
}
export function initials(name: string): string {
  const parts = (name || '').split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}
const TR_ASCII: Record<string, string> = {
  ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
};
export function trAscii(s: string): string {
  return String(s ?? '').replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_ASCII[c]);
}

/** Virgüllü / noktalı girişi sayıya çevirir ("1.250,5" ve "1250.5" ikisi de kabul). */
export function parseNum(s: string | number | null | undefined): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  let t = String(s ?? '').trim().replace(/\s/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const v = Number(t);
  return Number.isFinite(v) ? v : 0;
}
/** Düzenleme kutusu için sayıyı yazıya çevirir (binlik ayracı yok, ondalık virgül). */
export function numInput(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '';
  const t = String(Math.round(Number(x) * 1e6) / 1e6);
  return t.replace('.', ',');
}
