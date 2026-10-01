import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { BackupFile } from '../repo/backup';

/** Yedeği JSON dosyası olarak paylaşım menüsüne verir (Dosyalar'a kaydet, AirDrop, WhatsApp, e-posta...). */
export async function shareBackup(data: BackupFile): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const f = new File(Paths.cache, `atolye_yedek_${stamp}.json`);
  if (f.exists) f.delete();
  f.create();
  f.write(JSON.stringify(data));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda paylaşım desteklenmiyor.');
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Yedeği kaydet / paylaş', UTI: 'public.json' });
}

/** Kullanıcıya dosya seçtirir; seçim yoksa null. */
export async function pickBackup(): Promise<BackupFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.length) return null;
  const text = await new File(r.assets[0].uri).text();
  try {
    return JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('Dosya okunamadı: geçerli bir JSON yedeği değil.');
  }
}

/** Metni (CSV vb.) dosya olarak paylaşım menüsüne verir. */
export async function shareTextFile(fileName: string, content: string, mime = 'text/csv'): Promise<void> {
  const f = new File(Paths.cache, fileName);
  if (f.exists) f.delete();
  f.create();
  f.write('﻿' + content); // Excel'in Türkçe karakterleri doğru okuması için BOM
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda paylaşım desteklenmiyor.');
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: fileName });
}

/** Excel (TR) için noktalı virgülle ayrılmış CSV metni üretir. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(';')).join('\r\n');
}
