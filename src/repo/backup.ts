import { BACKUP_TABLES, TABLES_FOR_RESET } from '../db/schema';
import { initDb } from '../db/migrate';
import type { Db } from '../db/types';

export interface BackupFile {
  app: 'atolye-yonetim';
  version: 1;
  exported_at: string;
  tables: Record<string, Record<string, any>[]>;
}

/** Tüm tabloları JSON olarak dışa aktarır. Fotoğraflar dahil değildir (masaüstündeki gibi). */
const OPTIONAL_TABLES = ['machines', 'plan_overrides'];

export function makeBackupRepo(db: Db) {
  async function exportAll(): Promise<BackupFile> {
    const tables: BackupFile['tables'] = {};
    for (const t of BACKUP_TABLES) tables[t] = await db.all(`SELECT * FROM ${t}`);
    return { app: 'atolye-yonetim', version: 1, exported_at: new Date().toISOString(), tables };
  }

  /** Dosyadaki verinin tamamıyla mevcut veriyi DEĞİŞTİRİR. Hata olursa hiçbir şey değişmez. */
  async function importAll(file: BackupFile): Promise<void> {
    if (!file || file.app !== 'atolye-yonetim' || !file.tables) throw new Error('Geçerli bir yedek dosyası değil.');
    await db.exec('PRAGMA foreign_keys = OFF');
    try {
      await db.transaction(async () => {
        // eski yedeklerde makine tabloları yoktur: mevcut makineler silinmesin
        const skip = (t: string) => OPTIONAL_TABLES.includes(t) && !(t in file.tables);
        for (const t of [...BACKUP_TABLES].reverse()) if (!skip(t)) await db.run(`DELETE FROM ${t}`);
        for (const t of BACKUP_TABLES) {
          if (skip(t)) continue;
          const rows = file.tables[t] ?? [];
          for (const row of rows) {
            const cols = Object.keys(row);
            if (!cols.length) continue;
            await db.run(`INSERT INTO ${t}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
              cols.map((c) => row[c] ?? null));
          }
        }
      });
    } finally {
      await db.exec('PRAGMA foreign_keys = ON');
    }
    await initDb(db); // eksik ayarlar / sütunlar tamamlanır
  }

  /** Tüm kayıtları siler (ayarlar kalır). Fotoğraf dosyalarını silmek çağıranın işidir. */
  async function resetAll(): Promise<void> {
    await db.transaction(async () => {
      for (const t of TABLES_FOR_RESET) await db.run(`DELETE FROM ${t}`);
      await db.run('DELETE FROM sqlite_sequence');
    });
  }
  return { exportAll, importAll, resetAll };
}
export type BackupRepo = ReturnType<typeof makeBackupRepo>;
