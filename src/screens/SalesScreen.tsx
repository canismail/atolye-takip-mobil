import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SALE_STATUSES } from '../db/schema';
import type { Sale } from '../db/types';
import { dmy, money, num, numInput, toISO, today } from '../domain/format';
import { addDays } from '../domain/planning';
import { matches } from '../domain/search';
import { useApp, useData } from '../state/app';
import { ChoiceField, confirm, DateField, FormModal, n, NumberField, SelectField, TextField, type Option } from '../ui/forms';
import { Badge, Banner, Button, ButtonRow, Card, Chips, EmptyState, InfoRow, Kpi, KpiGrid, Muted, Screen, SearchBar } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

const FILTERS = ['Tümü', 'Bekliyor', 'Ödendi', 'Vadesi geçen'] as const;

export default function SalesScreen() {
  const { repo, bump } = useApp();
  const [q, setQ] = useState('');
  const [f, setF] = useState<(typeof FILTERS)[number]>('Tümü');
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<Sale | 'new' | null>(null);
  const [collect, setCollect] = useState<Sale | null>(null);
  const { data, loading, error, reload } = useData(async (r) => ({
    list: await r.sales.list(),
    month: r.metrics.thisMonth(),
    receivables: await r.metrics.receivables(),
    overdue: await r.metrics.overdueReceivables(),
    monthTotal: await r.metrics.salesTotal({ month: r.metrics.thisMonth() }),
    monthPaid: await r.metrics.salesTotal({ month: r.metrics.thisMonth(), status: 'Ödendi' }),
  }));
  const t = today();
  const list = useMemo(() => (data?.list ?? []).filter((s) => {
    if (f === 'Vadesi geçen' ? !(s.status === 'Bekliyor' && s.due_date && s.due_date < t) : f !== 'Tümü' && s.status !== f) return false;
    return matches(q, s.code, s.customer, s.product, s.status, s.note);
  }), [data, q, f, t]);

  return (
    <Screen loading={loading && !data} error={error} onRefresh={reload} fab={{ onPress: () => setForm('new') }}>
      <KpiGrid>
        <Kpi label="Bu Ay Satış" value={money(data?.monthTotal ?? 0)} icon="cash-outline" tone="blue" />
        <Kpi label="Bu Ay Tahsilat" value={money(data?.monthPaid ?? 0)} icon="checkmark-circle-outline" tone="green" />
        <Kpi label="Bekleyen Alacak" value={money(data?.receivables ?? 0)} icon="wallet-outline" tone="yellow" />
        <Kpi label="Vadesi Geçen" value={money(data?.overdue ?? 0)} icon="alert-circle-outline" tone="red" />
      </KpiGrid>
      <SearchBar value={q} onChange={setQ} placeholder="Satış ara..." />
      <Chips options={FILTERS} value={f} onChange={setF} />
      {!list.length ? <EmptyState text={data?.list.length ? 'Filtreye uyan satış yok.' : 'İlk satışı eklemek için + düğmesini kullanın.'} /> : null}
      {list.map((s) => {
        const expanded = open === s.id;
        const overdue = s.status === 'Bekliyor' && !!s.due_date && s.due_date < t;
        return (
          <Card key={s.id} onPress={() => setOpen(expanded ? null : s.id)} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{s.code}</Text>
              <Badge text={overdue ? 'Vadesi geçti' : s.status} tone={overdue ? 'red' : statusTone(s.status)} />
            </View>
            <Text style={{ color: colors.text }}>{s.customer || '-'} · {s.product || '-'}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Muted>{dmy(s.date)} · {num(s.quantity, 0)} adet</Muted>
              <Text style={{ fontWeight: '700', color: colors.text }}>{money(s.amount)}</Text>
            </View>
            {expanded ? (
              <View style={{ gap: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                <InfoRow label="Birim fiyat" value={money(s.unit_price)} />
                <InfoRow label="Vade" value={s.due_date ? dmy(s.due_date) : null} />
                <InfoRow label="Tahsilat" value={s.paid_date ? dmy(s.paid_date) : null} />
                {s.note ? <Muted>{s.note}</Muted> : null}
                <ButtonRow>
                  {s.status === 'Bekliyor'
                    ? <Button compact kind="primary" icon="checkmark" title="Tahsil Et" onPress={() => setCollect(s)} />
                    : <Button compact icon="refresh" title="Bekliyor yap" onPress={() => confirm('Tahsilatı geri al', `${s.code} tekrar 'Bekliyor' olacak; gelir kaydı kaldırılır.`, async () => { await repo.sales.markPending(s.id); bump(); }, 'Geri Al')} />}
                  <Button compact icon="create-outline" title="Düzenle" onPress={() => setForm(s)} />
                  <Button compact kind="danger" icon="trash-outline" title="Sil" onPress={() => confirm('Satışı sil', `${s.code} silinsin mi? Bağlı gelir kaydı da silinir.`, async () => { await repo.sales.remove(s.id); setOpen(null); bump(); })} />
                </ButtonRow>
              </View>
            ) : null}
          </Card>
        );
      })}
      {form ? <SaleForm sale={form === 'new' ? null : form} onClose={() => setForm(null)} /> : null}
      {collect ? <CollectForm sale={collect} onClose={() => setCollect(null)} /> : null}
    </Screen>
  );
}

function CollectForm({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { repo, bump } = useApp();
  const [on, setOn] = useState<string | null>(today());
  return (
    <FormModal visible title="Tahsilat" saveLabel="Tahsil Et" onClose={onClose} onSave={async () => { await repo.sales.markPaid(sale.id, on ?? undefined); bump(); onClose(); }}>
      <Muted>{sale.code} · {sale.customer || '-'} — {money(sale.amount)}</Muted>
      <DateField label="Tahsilat Tarihi" value={on} onChange={setOn} />
      <Muted>Kaydedildiğinde satış 'Ödendi' olur ve Gelir / Gider'e gelir kaydı eklenir.</Muted>
    </FormModal>
  );
}

function SaleForm({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { repo, bump, settings } = useApp();
  const taxRate = Number(settings.tax_rate || 0);
  const [custs, setCusts] = useState<Option<number>[]>([]);
  const [prods, setProds] = useState<(Option<number> & { price: number })[]>([]);
  const [cid, setCid] = useState<number | null>(sale?.customer_id ?? null);
  const [pid, setPid] = useState<number | null>(sale?.product_id ?? null);
  const [qty, setQty] = useState(numInput(sale?.quantity ?? 1));
  const [price, setPrice] = useState(numInput(sale?.unit_price ?? 0));
  const [addTax, setAddTax] = useState<'KDV ekle' | 'KDV yok'>(sale ? 'KDV yok' : 'KDV ekle');
  const [amount, setAmount] = useState(numInput(sale?.amount ?? 0));
  const [manual, setManual] = useState(!!sale);
  const [sdate, setSdate] = useState<string | null>(sale?.date ?? today());
  const [due, setDue] = useState<string | null>(sale?.due_date ?? toISO(addDays(new Date(), 30)));
  const [status, setStatus] = useState(sale?.status ?? 'Bekliyor');
  const [paid, setPaid] = useState<string | null>(sale?.paid_date ?? today());
  const [note, setNote] = useState(sale?.note ?? '');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const cs = await repo.customers.withStats();
      setCusts(cs.map((c) => ({ value: c.id, label: c.name + (c.status === 'Pasif' ? ' · Pasif' : '') })));
      const ps = await repo.products.withStats();
      setProds(ps.map((p) => ({ value: p.id, label: `${p.name} (${p.code})`, price: p.unit_price })));
      if (!sale) { if (cs.length) setCid(cs[0].id); if (ps.length) { setPid(ps[0].id); setPrice(numInput(ps[0].unit_price)); } }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = n(qty) * n(price);
  const total = addTax === 'KDV ekle' ? subtotal * (1 + taxRate / 100) : subtotal;
  // Miktar / fiyat / KDV değişince tutar yeniden hesaplanır (elle girilmişse korunur)
  useEffect(() => { if (!manual) setAmount(numInput(Math.round(total * 100) / 100)); }, [total, manual]);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setManual(false); };

  const save = async () => {
    if (cid === null || pid === null) return setErr('Müşteri ve ürün seçin.');
    if (!(n(qty) >= 1)) return setErr('Adet en az 1 olmalı.');
    if (!(n(amount) > 0)) return setErr('Tutar sıfırdan büyük olmalı.');
    await repo.sales.save({
      date: sdate ?? today(), customer_id: cid, product_id: pid, quantity: n(qty), unit_price: n(price), amount: n(amount),
      status, due_date: due, paid_date: status === 'Ödendi' ? paid : null, note: note.trim(),
    }, sale?.id);
    bump(); onClose();
  };

  if (!custs.length || !prods.length) {
    return (
      <FormModal visible title="Satış" onClose={onClose} onSave={onClose} saveLabel="Tamam">
        <Banner tone="yellow" text="Satış girmek için en az bir müşteri ve bir ürün tanımlı olmalı." />
      </FormModal>
    );
  }
  return (
    <FormModal visible title={sale ? sale.code : 'Yeni Satış'} onClose={onClose} onSave={save} error={err}>
      <SelectField label="Müşteri *" value={cid as number} options={custs} onChange={setCid} />
      <SelectField label="Ürün *" value={pid as number} options={prods} onChange={(v) => { setPid(v); const p = prods.find((x) => x.value === v); if (p) setPrice(numInput(p.price)); setManual(false); }} />
      <NumberField label="Adet *" value={qty} onChange={touch(setQty)} />
      <NumberField label="Birim Fiyat (KDV hariç)" value={price} onChange={touch(setPrice)} />
      <ChoiceField label="KDV" value={addTax} options={['KDV ekle', 'KDV yok'] as const} onChange={touch(setAddTax)} />
      <Muted>Ara toplam {money(subtotal)}{addTax === 'KDV ekle' ? ` · KDV (%${num(taxRate)}) ${money(total - subtotal)}` : ''} · Toplam {money(total)}</Muted>
      <NumberField label="Tutar" value={amount} onChange={(v) => { setAmount(v); setManual(true); }} hint="Hesaplanan toplam; gerekirse elle değiştirebilirsiniz (iskonto vb.)." />
      <DateField label="Tarih" value={sdate} onChange={setSdate} />
      <DateField label="Vade" value={due} onChange={setDue} optional />
      <ChoiceField label="Durum" value={status as any} options={SALE_STATUSES as any} onChange={setStatus} />
      {status === 'Ödendi' ? (
        <>
          <DateField label="Tahsilat Tarihi" value={paid} onChange={setPaid} />
          <Muted>Tahsil edilen satış, Gelir / Gider'e otomatik gelir kaydı olarak yazılır.</Muted>
        </>
      ) : null}
      <TextField label="Not" value={note} onChange={setNote} />
    </FormModal>
  );
}

