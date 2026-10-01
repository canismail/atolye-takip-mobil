import { DEFAULT_SETTINGS } from '../db/schema';
import type { Db, MaterialType } from '../db/types';

export function makeSettingsRepo(db: Db) {
  async function getAll(): Promise<Record<string, string>> {
    const s = { ...DEFAULT_SETTINGS };
    for (const r of await db.all<{ key: string; value: string }>('SELECT key, value FROM settings')) s[r.key] = r.value;
    return s;
  }
  async function get(key: string, def = ''): Promise<string> {
    const r = await db.get<{ value: string | null }>('SELECT value FROM settings WHERE key=?', [key]);
    if (!r || r.value === null) return DEFAULT_SETTINGS[key] ?? def;
    return r.value;
  }
  async function set(values: Record<string, string | number>): Promise<void> {
    await db.transaction(async () => {
      for (const [k, v] of Object.entries(values)) {
        await db.run(
          'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
          [k, String(v)],
        );
      }
    });
  }
  async function materialTypes(): Promise<MaterialType[]> {
    let rows: any[] = [];
    try {
      rows = JSON.parse((await get('material_types')) || '[]');
    } catch {
      rows = [];
    }
    return rows
      .filter((r) => r && r.name && Number(r.density) > 0)
      .map((r) => ({ name: String(r.name), density: Number(r.density) }));
  }
  async function setMaterialTypes(rows: MaterialType[]): Promise<void> {
    await set({ material_types: JSON.stringify(rows) });
  }
  return { getAll, get, set, materialTypes, setMaterialTypes };
}
export type SettingsRepo = ReturnType<typeof makeSettingsRepo>;
