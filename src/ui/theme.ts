export const colors = {
  bg: '#f4f6fa', card: '#ffffff', text: '#1c2733', muted: '#687587', border: '#e3e8ef',
  primary: '#1673d1', primarySoft: '#e8f2ff', onPrimary: '#ffffff',
  green: '#11784d', greenSoft: '#dff5e9', red: '#d33e3e', redSoft: '#ffdede',
  yellow: '#946800', yellowSoft: '#ffeab0', gray: '#687587', graySoft: '#e9edf2',
  purple: '#6b4fd3', purpleSoft: '#efe9ff',
};
export type Tone = 'green' | 'gray' | 'red' | 'yellow' | 'blue' | 'purple';
export const TONES: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: colors.greenSoft, fg: colors.green },
  gray: { bg: colors.graySoft, fg: colors.gray },
  red: { bg: colors.redSoft, fg: colors.red },
  yellow: { bg: colors.yellowSoft, fg: colors.yellow },
  blue: { bg: colors.primarySoft, fg: colors.primary },
  purple: { bg: colors.purpleSoft, fg: colors.purple },
};
const STATUS_TONE: Record<string, Tone> = {
  Normal: 'green', 'Minimuma Yakın': 'yellow', Kritik: 'red',
  Bekliyor: 'yellow', Üretimde: 'blue', Tamamlandı: 'green', İptal: 'red', Ödendi: 'green',
  Aktif: 'green', Pasif: 'gray', Zamanında: 'green', Gecikir: 'red', 'Operasyon yok': 'gray',
  Hazır: 'green', Gelir: 'green', Gider: 'red',
};
export const statusTone = (s: string): Tone => STATUS_TONE[s] ?? 'gray';
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16 };
