import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ORDER_STATUSES } from '../db/schema';
import type { WorkOrder } from '../db/types';
import { addDays } from '../domain/planning';
import { dmy, num, toISO, today } from '../domain/format';
import { matches } from '../domain/search';
import { statusForProgress } from '../repo/orders';
import { useApp, useData } from '../state/app';
import { ChoiceField, confirm, DateField, Field, FormModal, n, NumberField, SelectField, TextField, type Option } from '../ui/forms';
import { Badge, Banner, Button, ButtonRow, Card, Chips, EmptyState, InfoRow, Kpi, KpiGrid, Muted, ProgressBar, Screen, SearchBar } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

const FILTERS = ['Açık', 'Tümü', ...ORDER_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

export default function OrdersScreen() {
  const { repo, bump } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('Açık');
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<{ wo: WorkOrder | null } | null>(null);
  const [prog, setProg] = useState<WorkOrder | null>(null);
  const { data: orders, loading, error, reload } = useData((r) => r.orders.list());

  const list = useMemo(() => (orders ?? []).filter((w) => {
    if (filter === 'Açık' && !(w.status === 'Bekliyor' || w.status === 'Üretimde')) return false;
    if (filter !== 'Açık' && filter !== 'Tümü' && w.status !== filter) return false;
    return matches(q, w.code, w.product, w.customer, w.status);
  }), [orders, q, filter]);

  const t = today();
  const all = orders ?? [];
  const isOpen = (w: WorkOrder) => w.status === 'Bekliyor' || w.status === 'Üretimde';
  const late = all.filter((w) => isOpen(w) && w.due_date && w.due_date < t).length;
  const done = all.filter((w) => w.status === 'Tamamlandı' && (w.completed_at || '').slice(0, 7) === t.slice(0, 7)).length;

  return (
    <Screen loading={loading && !orders} error={error} onRefresh={reload} fab={{ onPress: () => setForm({ wo: null }) }}>
      <KpiGrid>
        <Kpi label="Açık Sipariş" value={num(all.filter(isOpen).length)} icon="clipboard-outline" tone="blue" />
        <Kpi label="Üretimde" value={num(all.filter((w) => w.status === 'Üretimde').length)} icon="construct-outline" tone="yellow" />
        <Kpi label="Termini Geçen" value={num(late)} icon="alert-circle-outline" tone="red" />
        <Kpi label="Bu Ay Tamamlanan" value={num(done)} icon="checkmark-circle-outline" tone="green" />
      </KpiGrid>
      <SearchBar value={q} onChange={setQ} placeholder="İş emri ara..." />
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      {!list.length ? <EmptyState text={all.length ? 'Filtreye uyan sipariş yok.' : 'Henüz sipariş yok. + ile ekleyin.'} /> : null}
      {list.map((w) => {
        const expanded = open === w.id;
        const overdue = isOpen(w) && !!w.due_date && w.due_date < t;
        return (
          <Card key={w.id} onPress={() => setOpen(expanded ? null : w.id)} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', color: colors.text, fontSize: 15 }}>{w.code}</Text>
              <Badge text={w.status} tone={statusTone(w.status)} />
            </View>
            <Text style={{ color: colors.text, fontSize: 15 }}>{w.product} · {num(w.quantity, 0)} adet</Text>
            <ProgressBar value={w.progress} tone={w.status === 'Tamamlandı' ? 'green' : 'blue'} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Muted>%{w.progress} · {w.customer || 'Stok için üretim'}</Muted>
              <Text style={{ fontSize: 13, color: overdue ? colors.red : colors.muted, fontWeight: overdue ? '700' : '400' }}>
                Termin {dmy(w.due_date)}
              </Text>
            </View>
            {expanded ? (
              <View style={{ gap: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                <InfoRow label="Tahmini süre" value={w.unit_minutes ? `${num((w.unit_minutes * w.quantity + (w.setup_total ?? 0)) / 60, 1)} saat` : null} />
                <InfoRow label="Tamamlanma" value={w.completed_at ? dmy(w.completed_at) : null} />
                {w.note ? <Muted>{w.note}</Muted> : null}
                <ButtonRow>
                  {w.status !== 'İptal' ? <Button compact icon="speedometer-outline" title="İlerleme" onPress={() => setProg(w)} /> : null}
                  <Button compact icon="create-outline" title="Düzenle" onPress={() => setForm({ wo: w })} />
                  {w.status === 'İptal' ? (
                    <Button compact icon="refresh" title="Yeniden Aç" onPress={async () => { await repo.orders.reopen(w.id); bump(); }} />
                  ) : w.status !== 'Tamamlandı' ? (
                    <Button compact kind="danger" icon="close" title="İptal Et" onPress={() => confirm('Siparişi iptal et', `${w.code} iptal edilsin mi?`, async () => { await repo.orders.cancel(w.id); bump(); }, 'İptal Et')} />
                  ) : null}
                  <Button compact kind="danger" icon="trash-outline" title="Sil" onPress={() => confirm('Siparişi sil', `${w.code} silinsin mi?`, async () => { await repo.orders.remove(w.id); setOpen(null); bump(); })} />
                </ButtonRow>
              </View>
            ) : null}
          </Card>
        );
      })}
      {form ? <OrderForm wo={form.wo} onClose={() => setForm(null)} /> : null}
      {prog ? <ProgressForm wo={prog} onClose={() => setProg(null)} /> : null}
    </Screen>
  );
}

export function OrderForm({ wo, onClose, defaultProductId }: { wo: WorkOrder | null; onClose: () => void; defaultProductId?: number }) {
  const { repo, bump } = useApp();
  const [products, setProducts] = useState<Option<number>[]>([]);
  const [customers, setCustomers] = useState<Option<number | null>[]>([]);
  const [pid, setPid] = useState<number | null>(wo?.product_id ?? defaultProductId ?? null);
  const [cid, setCid] = useState<number | null>(wo?.customer_id ?? null);
  const [qty, setQty] = useState(String(wo?.quantity ?? 1));
  const [due, setDue] = useState<string | null>(wo?.due_date ?? toISO(addDays(new Date(), 7)));
  const [status, setStatus] = useState(wo?.status ?? 'Bekliyor');
  const [progress, setProgress] = useState(String(wo?.progress ?? 0));
  const [note, setNote] = useState(wo?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [need, setNeed] = useState<{ minutes: number; short: string[] }>({ minutes: 0, short: [] });

  useEffect(() => {
    (async () => {
      const ps = await repo.products.withStats();
      setProducts(ps.map((p) => ({ value: p.id, label: `${p.name} (${p.code})${p.status === 'Pasif' ? ' · Pasif' : ''}` })));
      if (pid === null && ps.length) setPid(ps[0].id);
      const cs = await repo.customers.withStats();
      setCustomers([{ value: null, label: '— Stok için üretim (müşterisiz) —' }, ...cs.map((c) => ({ value: c.id as number | null, label: c.name }))]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qtyN = n(qty);
  useEffect(() => {
    (async () => {
      if (pid === null) return;
      const p = await repo.products.get(pid);
      const mats = await repo.products.materials(pid);
      const stocks = await repo.stock.list({ withProducts: true });
      const have = new Map(stocks.map((s) => [s.id, s.quantity]));
      const short = mats.filter((m) => m.quantity * qtyN > (have.get(m.stock_id) ?? 0))
        .map((m) => `${m.name} (gerekli ${num(m.quantity * qtyN)} ${m.unit}, mevcut ${num(have.get(m.stock_id) ?? 0)})`);
      setNeed({ minutes: (p?.total_minutes ?? 0) * qtyN + (p?.setup_total ?? 0), short });
    })();
  }, [pid, qtyN, repo]);

  const save = async () => {
    if (pid === null) return setErr('Ürün seçin. Önce Ürünler sayfasından ürün ekleyin.');
    if (!(qtyN >= 1)) return setErr('Adet en az 1 olmalı.');
    let p = Math.max(0, Math.min(100, Math.round(n(progress))));
    if (status === 'Üretimde' && p === 0) p = 5;
    await repo.orders.save({ customer_id: cid, product_id: pid, quantity: qtyN, due_date: due, progress: p, status, note: note.trim(), completed_at: wo?.completed_at ?? null }, wo?.id);
    bump();
    onClose();
  };

  return (
    <FormModal visible title={wo ? wo.code : 'Yeni İş Emri'} onClose={onClose} onSave={save} error={err}>
      <SelectField label="Ürün *" value={pid as number} options={products} onChange={setPid} placeholder="Ürün seçin" />
      <SelectField label="Müşteri" value={cid} options={customers} onChange={setCid} />
      <NumberField label="Adet *" value={qty} onChange={setQty} />
      <DateField label="Termin" value={due} onChange={setDue} optional />
      <ChoiceField label="Durum" value={status as any} options={ORDER_STATUSES as any} onChange={(v) => setStatus(v)} />
      {status !== 'Tamamlandı' ? <NumberField label="İlerleme" value={progress} onChange={setProgress} suffix="%" /> : null}
      <TextField label="Not" value={note} onChange={setNote} multiline />
      {need.minutes ? <Muted>Tahmini üretim süresi: {num(need.minutes / 60, 1)} saat</Muted> : null}
      {need.short.length ? <Banner tone="yellow" text={'Stok yetersiz: ' + need.short.join(', ')} /> : null}
    </FormModal>
  );
}

function ProgressForm({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  const { repo, bump } = useApp();
  const [p, setP] = useState(wo.progress);
  const step = (d: number) => setP((v) => Math.max(0, Math.min(100, v + d)));
  const next = statusForProgress(p, wo.status);
  return (
    <FormModal visible title={`${wo.code} · İlerleme`} onClose={onClose}
      onSave={async () => { await repo.orders.updateProgress(wo.id, p); bump(); onClose(); }}>
      <Muted>{wo.product} — {num(wo.quantity, 0)} adet</Muted>
      <Text style={{ fontSize: 40, fontWeight: '800', textAlign: 'center', color: colors.primary }}>%{p}</Text>
      <ProgressBar value={p} />
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
        <Button title="−10" onPress={() => step(-10)} /><Button title="−5" onPress={() => step(-5)} />
        <Button title="+5" onPress={() => step(5)} /><Button title="+10" onPress={() => step(10)} />
      </View>
      <ButtonRow>{[0, 25, 50, 75, 100].map((v) => <Button key={v} compact title={`%${v}`} onPress={() => setP(v)} />)}</ButtonRow>
      <Field label="Yeni durum"><Badge text={next} tone={statusTone(next)} /></Field>
    </FormModal>
  );
}
