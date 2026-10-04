import type { Db, Machine, PlanOverride } from '../db/types';

export interface MachineInput {
  name: string; type: string; daily_hours: number; active: boolean; note?: string; changeover_minutes: number;
}

/** Makineler ve elle plan yerleştirmeleri (masaüstü: machines_list / plan_overrides). */
export function makeMachinesRepo(db: Db) {
  async function list(activeOnly = false): Promise<Machine[]> {
    return db.all<Machine>(`SELECT * FROM machines${activeOnly ? ' WHERE active=1' : ''} ORDER BY type, name, id`);
  }
  async function types(): Promise<string[]> {
    return (await db.all<{ type: string }>('SELECT DISTINCT type FROM machines ORDER BY type')).map((r) => r.type);
  }
  async function save(input: MachineInput, id?: number): Promise<number> {
    const name = input.name.trim();
    const type = input.type.trim();
    if (!name || !type) throw new Error('Makine adı ve türü zorunludur.');
    const hours = Math.min(24, Math.max(0.5, Number(input.daily_hours) || 8));
    const chg = Math.max(0, Number(input.changeover_minutes) || 0);
    const note = (input.note ?? '').trim() || null;
    if (id !== undefined) {
      await db.run('UPDATE machines SET name=?, type=?, daily_hours=?, active=?, note=?, changeover_minutes=? WHERE id=?',
        [name, type, hours, input.active ? 1 : 0, note, chg, id]);
      return id;
    }
    const r = await db.run('INSERT INTO machines(name, type, daily_hours, active, note, changeover_minutes) VALUES (?,?,?,?,?,?)',
      [name, type, hours, input.active ? 1 : 0, note, chg]);
    return r.lastId;
  }
  async function setActive(id: number, active: boolean): Promise<void> {
    await db.run('UPDATE machines SET active=? WHERE id=?', [active ? 1 : 0, id]);
  }
  async function remove(id: number): Promise<void> {
    await db.run('DELETE FROM machines WHERE id=?', [id]);
    await db.run('UPDATE plan_overrides SET machine_id=NULL WHERE machine_id=?', [id]);
  }
  async function overrides(): Promise<PlanOverride[]> {
    return db.all<PlanOverride>('SELECT * FROM plan_overrides ORDER BY id');
  }
  async function setOverride(workOrderId: number, opId: number, machineId: number | null, day: string | null): Promise<void> {
    await db.run(
      'INSERT INTO plan_overrides(work_order_id, op_id, machine_id, day) VALUES (?,?,?,?) ' +
        'ON CONFLICT(work_order_id, op_id) DO UPDATE SET machine_id=excluded.machine_id, day=excluded.day',
      [workOrderId, opId, machineId ?? null, day ?? null]);
  }
  async function clearOverride(workOrderId: number, opId: number): Promise<void> {
    await db.run('DELETE FROM plan_overrides WHERE work_order_id=? AND op_id=?', [workOrderId, opId]);
  }
  async function clearOverrides(): Promise<void> {
    await db.run('DELETE FROM plan_overrides');
  }
  return { list, types, save, setActive, remove, overrides, setOverride, clearOverride, clearOverrides };
}
export type MachinesRepo = ReturnType<typeof makeMachinesRepo>;
