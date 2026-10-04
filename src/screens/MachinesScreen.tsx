import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { Machine } from '../db/types';
import { num, numInput } from '../domain/format';
import { matches } from '../domain/search';
import { useApp, useData } from '../state/app';
import { ChoiceField, confirm, FormModal, n, NumberField, SelectField, TextField, type Option } from '../ui/forms';
import { Badge, Button, ButtonRow, Card, EmptyState, Kpi, KpiGrid, Muted, Screen, SearchBar } from '../ui/kit';
import { colors } from '../ui/theme';

const NEW_TYPE = '__new__';

export default function MachinesScreen() {
  const { repo, bump } = useApp();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Machine | 'new' | null>(null);
  const { data, loading, error, reload } = useData(async (r) => ({ rows: await r.machines.list(), types: await r.machines.types() }));
  const rows = data?.rows ?? [];
  const active = rows.filter((m) => m.active);
  const list = useMemo(() => rows.filter((m) => matches(q, m.name, m.type, m.note)), [rows, q]);

  return (
    <Screen loading={loading && !data} error={error} onRefresh={reload} fab={{ onPress: () => setForm('new') }}>
      <KpiGrid>
        <Kpi label="Toplam Makine" value={num(rows.length)} icon="hardware-chip-outline" tone="blue" />
        <Kpi label="Aktif" value={num(active.length)} icon="checkmark-circle-outline" tone="green" />
        <Kpi label="Pasif" value={num(rows.length - active.length)} icon="pause-circle-outline" tone="yellow" />
        <Kpi label="Günlük Makine Saati" value={`${num(active.reduce((a, m) => a + m.daily_hours, 0))} saat`} icon="time-outline" tone="purple" />
      </KpiGrid>
      <SearchBar value={q} onChange={setQ} placeholder="Makine ara..." />
      {!rows.length ? <EmptyState text="Henüz makine yok. Sağ alttaki + ile ekleyin." /> : null}
      {list.map((m) => (
        <Card key={m.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', color: colors.text, flexShrink: 1 }}>{m.name}</Text>
            <Badge text={m.active ? 'Aktif' : 'Pasif'} tone={m.active ? 'green' : 'gray'} />
          </View>
          <Muted>{m.type} · {num(m.daily_hours)} saat/gün · ayarlama {num(m.changeover_minutes / 60)} sa{m.note ? ` · ${m.note}` : ''}</Muted>
          <ButtonRow>
            <Button compact icon="create-outline" title="Düzenle" onPress={() => setForm(m)} />
            <Button compact title={m.active ? '→ Pasif' : '→ Aktif'} onPress={async () => { await repo.machines.setActive(m.id, !m.active); bump(); }} />
            <Button compact kind="danger" icon="trash-outline" title="" onPress={() =>
              confirm('Makine silinsin mi?', m.name, async () => { await repo.machines.remove(m.id); bump(); })} />
          </ButtonRow>
        </Card>
      ))}
      <Muted>Pasif makineler üretim planına girmez. Aynı türdeki makineler birbirinin yedeğidir.</Muted>
      {form ? <MachineForm row={form === 'new' ? null : form} types={data?.types ?? []} onClose={() => setForm(null)} /> : null}
    </Screen>
  );
}

function MachineForm({ row, types, onClose }: { row: Machine | null; types: string[]; onClose: () => void }) {
  const { repo, bump } = useApp();
  const [name, setName] = useState(row?.name ?? '');
  const [sel, setSel] = useState<string>(row?.type ?? types[0] ?? NEW_TYPE);
  const [newType, setNewType] = useState('');
  const [hours, setHours] = useState(numInput(row?.daily_hours ?? 8));
  const [chg, setChg] = useState(numInput(row?.changeover_minutes ?? 120));
  const [state, setState] = useState<'Aktif' | 'Pasif'>(row && !row.active ? 'Pasif' : 'Aktif');
  const [note, setNote] = useState(row?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const opts: Option<string>[] = [...types.map((t) => ({ value: t, label: t })), { value: NEW_TYPE, label: '➕ Yeni tür...' }];
  const save = async () => {
    try {
      await repo.machines.save({ name, type: sel === NEW_TYPE ? newType : sel, daily_hours: n(hours), active: state === 'Aktif',
        note, changeover_minutes: n(chg) }, row?.id);
      bump(); onClose();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
  };
  return (
    <FormModal visible title={row ? 'Makineyi Düzenle' : 'Yeni Makine'} onClose={onClose} onSave={save} error={err}>
      <TextField label="Makine adı *" value={name} onChange={setName} placeholder="Örn. Torna 3" autoCapitalize="words" />
      <SelectField label="Makine türü *" value={sel} options={opts} onChange={setSel} placeholder="Seçin" />
      {sel === NEW_TYPE ? <TextField label="Yeni tür adı" value={newType} onChange={setNewType} placeholder="Örn. Taşlama" autoCapitalize="words" /> : null}
      <NumberField label="Günlük çalışma (saat)" value={hours} onChange={setHours} suffix="sa" />
      <NumberField label="Parça ayarlama süresi (dk)" value={chg} onChange={setChg} suffix="dk"
        hint="Bu makinede her operasyondan önce harcanan ayarlama / sök-tak süresi (varsayılan 2 saat)." />
      <ChoiceField label="Durum" value={state} options={['Aktif', 'Pasif'] as const} onChange={setState} />
      <TextField label="Not" value={note} onChange={setNote} placeholder="İsteğe bağlı" />
    </FormModal>
  );
}
