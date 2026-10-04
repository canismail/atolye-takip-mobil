import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { dmy, num, toISO } from '../domain/format';
import { clock, hm, isoDay, overrideKey, schedulePlan, shiftMinutes, type OrderIn, type OverrideMap, type PlanItem } from '../domain/machinePlan';
import { planParams, remainingUnits } from '../domain/planning';
import { useApp, useData } from '../state/app';
import { confirm, DateField, FormModal, SelectField, TextField, type Option } from '../ui/forms';
import { Badge, Banner, Button, ButtonRow, Card, Chips, EmptyState, Kpi, KpiGrid, Muted, SectionTitle } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

const MON = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** Üretim Planı sayfasındaki "Makine Bazlı Plan" bölümü (masaüstü ile aynı model). */
export function MachinePlanSection() {
  const { repo, bump } = useApp();
  const [moving, setMoving] = useState<PlanItem | null>(null);
  const [shiftEdit, setShiftEdit] = useState<string | null>(null);
  const [daySel, setDaySel] = useState<string | null>(null);
  const { data } = useData(async (r) => {
    const orders = (await r.orders.list()).filter((w) => w.status === 'Bekliyor' || w.status === 'Üretimde');
    const ops = new Map<number, Awaited<ReturnType<typeof r.products.operations>>>();
    for (const w of orders) if (!ops.has(w.product_id)) ops.set(w.product_id, await r.products.operations(w.product_id));
    return { S: await r.settings.getAll(), machines: await r.machines.list(), orders, ops, ovs: await r.machines.overrides() };
  });

  const plan = useMemo(() => {
    if (!data) return null;
    const P = planParams(data.S);
    const specs: OrderIn[] = data.orders.map((w) => ({
      key: w.id, label: w.code, product: (w as any).product ?? '-',
      qty: remainingUnits(w.quantity, w.progress), due: w.due_date,
      ops: (data.ops.get(w.product_id) ?? []).map((o) => ({ key: o.id, name: o.name, minutes: o.minutes, setup: o.setup_minutes ?? 0, machineType: o.machine_type ?? '' })),
    }));
    const ov: OverrideMap = new Map();
    for (const r of data.ovs) if (r.op_id !== null) ov.set(overrideKey(r.work_order_id, r.op_id), { machineId: r.machine_id, day: r.day });
    return schedulePlan(specs, data.machines, new Date(), P.weekDays, P.buffer, 0, ov);
  }, [data]);

  if (!data || !plan) return null;
  const shift = shiftMinutes(data.S);
  const active = data.machines.filter((m) => m.active);
  if (!data.machines.length) return <Banner tone="yellow" text="Önce Daha Fazla → Makineler sayfasından makine tanımlayın." />;

  // gün -> makine -> parçalar
  type Seg = { a0: number; a1: number; item: PlanItem; order: string; cont: boolean };
  const byDay = new Map<string, Map<string, Seg[]>>();
  for (const o of plan.orders) for (const it of o.items) it.segments.forEach((g, i) => {
    const d = isoDay(g.day);
    const m = byDay.get(d) ?? new Map<string, Seg[]>();
    byDay.set(d, m);
    const arr = m.get(it.machine) ?? [];
    arr.push({ a0: g.a0, a1: g.a1, item: it, order: o.label, cont: i > 0 });
    m.set(it.machine, arr);
  });
  const days = [...byDay.keys()].sort().slice(0, 14);
  const cur = daySel && byDay.has(daySel) ? daySel : days[0] ?? null;
  const late = plan.orders.filter((o) => o.state === 'Gecikir').length;
  const dayLabel = (d: string) => `${MON[(new Date(d + 'T00:00:00').getDay() + 6) % 7]} ${dmy(d).slice(0, 5)}`;
  const labelToDay = new Map(days.map((d) => [dayLabel(d), d]));

  const saveShift = async () => {
    const t = (shiftEdit ?? '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(t)) return;
    const [h, m] = t.split(':').map(Number);
    if (h > 23 || m > 59) return;
    await repo.settings.set({ plan_shift_start: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
    setShiftEdit(null); bump();
  };

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle right={<Button compact icon="time-outline" title={`Vardiya ${hm(0, shift)}`} onPress={() => setShiftEdit(hm(0, shift))} />}>Makine Bazlı Plan</SectionTitle>
      <KpiGrid>
        <Kpi label="Aktif Makine" value={`${active.length} / ${data.machines.length}`} icon="hardware-chip-outline" tone="blue" />
        <Kpi label="Günlük Makine Saati" value={`${num(active.reduce((a, m) => a + m.daily_hours, 0))} saat`} icon="time-outline" tone="green" />
        <Kpi label="Geciken Sipariş" value={num(late)} icon="alert-circle-outline" tone={late ? 'red' : 'green'} />
        <Kpi label="Plan Bitişi" value={plan.end ? dmy(plan.end) : '-'} icon="flag-outline" tone="purple" />
      </KpiGrid>
      <Muted>Süre = parça ayarlama (makine varsayılanı, genelde 2 saat) + adet × süre × (1 + buffer). Operasyon sırası korunur; arka arkaya aynı türdeki operasyonlar farklı makinelerde aynı anda çalışabilir.</Muted>
      {plan.orders.filter((o) => o.state === 'Makine yok').map((o) => (
        <Banner key={o.key} tone="yellow" text={`${o.label} planlanamadı: "${o.blockedOp}" için ${o.blockedType ? `"${o.blockedType}" türünde ` : ''}aktif makine yok.`} />
      ))}

      <SectionTitle>Günlük Çizelge</SectionTitle>
      {!cur ? <EmptyState text="Planlanacak açık sipariş yok." /> : (
        <>
          <Chips options={days.map(dayLabel)} value={dayLabel(cur)} onChange={(l) => setDaySel(labelToDay.get(l) ?? null)} />
          {[...(byDay.get(cur) ?? new Map<string, Seg[]>()).entries()].map(([mname, segs]) => (
            <Card key={mname} style={{ gap: 6 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{mname}</Text>
              {segs.sort((a, b) => a.a0 - b.a0).map((s, i) => (
                <Pressable key={i} onPress={() => setMoving(s.item)} style={{ paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <Text style={{ color: colors.text, fontFamily: 'Courier', fontWeight: '700' }}>{hm(s.a0, shift)}–{hm(s.a1, shift)}</Text>
                  <Text style={{ color: colors.text }}>{s.item.op}{s.cont ? ' (devam)' : ''}{s.item.forced ? ' 📌' : ''}</Text>
                  <Muted>{s.order} · dokun: başka makine / güne taşı</Muted>
                </Pressable>
              ))}
            </Card>
          ))}
        </>
      )}

      <SectionTitle right={data.ovs.length ? <Button compact kind="danger" title="Elle ayarları sıfırla" onPress={() =>
        confirm('Elle yapılan yerleştirmeler silinsin mi?', 'Plan otomatik düzene döner.', async () => { await repo.machines.clearOverrides(); bump(); }, 'Sıfırla')} /> : undefined}>Siparişler</SectionTitle>
      {plan.orders.map((o) => (
        <Card key={o.key} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{o.label} · {o.product}</Text>
            <Badge text={o.state} tone={statusTone(o.state)} />
          </View>
          {o.start && o.end ? (
            <>
              <Muted>Başlangıç: {dmy(o.start)} {clock(o.startT, shift)}</Muted>
              <Muted>Bitiş: {dmy(o.end)} {clock(o.endT, shift)}{o.due ? ` · termin ${dmy(o.due)}` : ''}</Muted>
            </>
          ) : null}
          {o.items.map((it, i) => (
            <Pressable key={i} onPress={() => setMoving(it)}>
              <Text style={{ color: colors.text, fontSize: 13 }}>
                {it.stage}. {it.op} → {it.machine} · {dmy(it.startDate)} {clock(it.start, shift)} → {dmy(it.endDate)} {clock(it.end, shift)}{it.forced ? ' 📌' : ''}
              </Text>
            </Pressable>
          ))}
        </Card>
      ))}

      {moving ? <MoveForm item={moving} machines={active.map((m) => ({ value: m.id, label: `${m.name} (${m.type})` }))} onClose={() => setMoving(null)} /> : null}
      {shiftEdit !== null ? (
        <FormModal visible title="Vardiya Başlangıcı" onClose={() => setShiftEdit(null)} onSave={saveShift}>
          <TextField label="Saat (SS:DD)" value={shiftEdit} onChange={setShiftEdit} placeholder="08:00" />
          <Muted>Çizelgedeki saatler bu saate göre gösterilir.</Muted>
        </FormModal>
      ) : null}
    </View>
  );
}

function MoveForm({ item, machines, onClose }: { item: PlanItem; machines: Option<number>[]; onClose: () => void }) {
  const { repo, bump } = useApp();
  const [mid, setMid] = useState<number | null>(item.machineId);
  const [day, setDay] = useState<string | null>(isoDay(item.startDate) || toISO(new Date()));
  const save = async () => {
    if (item.opKey === null) return onClose();
    await repo.machines.setOverride(item.orderKey, item.opKey, mid, day);
    bump(); onClose();
  };
  return (
    <FormModal visible title="Operasyonu Taşı" onClose={onClose} onSave={save}>
      <Muted>{item.op}</Muted>
      <SelectField label="Makine" value={mid} options={machines as Option<number | null>[]} onChange={setMid} />
      <DateField label="En erken gün" value={day} onChange={setDay} />
      <Muted>Süre ve sonraki operasyonlar yeni yerleşime göre yeniden hesaplanır.</Muted>
      {item.forced && item.opKey !== null ? (
        <ButtonRow><Button kind="danger" title="Elle ayarı kaldır" onPress={async () => { await repo.machines.clearOverride(item.orderKey, item.opKey!); bump(); onClose(); }} /></ButtonRow>
      ) : null}
    </FormModal>
  );
}
