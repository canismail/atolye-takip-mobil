import React, { useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { CUSTOMER_STATUSES } from '../db/schema';
import type { CustomerStats } from '../db/types';
import { dmy, money } from '../domain/format';
import { matches } from '../domain/search';
import { useApp, useData } from '../state/app';
import { ChoiceField, confirm, FormModal, info, TextField } from '../ui/forms';
import { Badge, Button, ButtonRow, Card, Chips, EmptyState, InfoRow, Kpi, KpiGrid, ListRow, Muted, Screen, SearchBar } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

const FILTERS = ['Tümü', 'Aktif', 'Pasif'] as const;

export default function CustomersScreen() {
  const { repo, bump } = useApp();
  const [q, setQ] = useState('');
  const [f, setF] = useState<(typeof FILTERS)[number]>('Tümü');
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerStats | 'new' | null>(null);
  const { data, loading, error, reload } = useData(async (r) => ({
    list: await r.customers.withStats(),
    sales: await r.sales.list(),
  }));
  const all = data?.list ?? [];
  const list = useMemo(() => all.filter((c) => (f === 'Tümü' || c.status === f) && matches(q, c.code, c.name, c.contact, c.phone, c.email)), [all, q, f]);
  const sum = (k: 'balance' | 'overdue' | 'total_sales') => all.reduce((a, c) => a + c[k], 0);

  return (
    <Screen loading={loading && !data} error={error} onRefresh={reload} fab={{ onPress: () => setForm('new') }}>
      <KpiGrid>
        <Kpi label="Müşteri" value={String(all.length)} icon="people-outline" tone="blue" />
        <Kpi label="Toplam Satış" value={money(sum('total_sales'))} icon="cash-outline" tone="green" />
        <Kpi label="Açık Bakiye" value={money(sum('balance'))} icon="wallet-outline" tone="yellow" />
        <Kpi label="Vadesi Geçen" value={money(sum('overdue'))} icon="alert-circle-outline" tone="red" />
      </KpiGrid>
      <SearchBar value={q} onChange={setQ} placeholder="Müşteri ara..." />
      <Chips options={FILTERS} value={f} onChange={setF} />
      {!list.length ? <EmptyState text={all.length ? 'Filtreye uyan müşteri yok.' : 'İlk müşteriyi eklemek için + düğmesini kullanın.'} /> : null}
      {list.map((c) => {
        const expanded = open === c.id;
        const recent = (data?.sales ?? []).filter((s) => s.customer_id === c.id).slice(0, 5);
        return (
          <Card key={c.id} style={{ padding: 0 }}>
            <ListRow title={c.name} subtitle={`${c.code}${c.contact ? ` · ${c.contact}` : ''}`}
              meta={c.balance ? money(c.balance) : undefined} right={<Badge text={c.status} tone={statusTone(c.status)} />}
              badge={c.overdue ? <Text style={{ color: colors.red, fontSize: 12 }}>Vadesi geçen {money(c.overdue)}</Text> : undefined}
              onPress={() => setOpen(expanded ? null : c.id)} />
            {expanded ? (
              <View style={{ padding: 16, paddingTop: 0, gap: 8 }}>
                <InfoRow label="Telefon" value={c.phone} />
                <InfoRow label="E-posta" value={c.email} />
                <InfoRow label="Adres" value={c.address} />
                <InfoRow label="Vergi No" value={c.tax_no} />
                <InfoRow label="Toplam satış" value={money(c.total_sales)} />
                <InfoRow label="Açık bakiye" value={money(c.balance)} />
                {recent.length ? <Muted>Son satışlar: {recent.map((s) => `${s.code} (${dmy(s.date)}, ${money(s.amount)})`).join(' · ')}</Muted> : null}
                <ButtonRow>
                  <Button compact kind="primary" icon="create-outline" title="Düzenle" onPress={() => setForm(c)} />
                  {c.phone ? <Button compact icon="call-outline" title="Ara" onPress={() => Linking.openURL(`tel:${c.phone}`)} /> : null}
                  <Button compact title={c.status === 'Aktif' ? '→ Pasif' : '→ Aktif'} onPress={async () => { await repo.customers.setStatus(c.id, c.status === 'Aktif' ? 'Pasif' : 'Aktif'); bump(); }} />
                  <Button compact kind="danger" icon="trash-outline" title="Sil" onPress={() => confirm('Müşteriyi sil', `${c.name} silinsin mi?`, async () => {
                    const e = await repo.customers.remove(c.id);
                    if (e) info('Silinemedi', e); else { setOpen(null); bump(); }
                  })} />
                </ButtonRow>
              </View>
            ) : null}
          </Card>
        );
      })}
      {form ? <CustomerForm c={form === 'new' ? null : form} onClose={() => setForm(null)} /> : null}
    </Screen>
  );
}

function CustomerForm({ c, onClose }: { c: CustomerStats | null; onClose: () => void }) {
  const { repo, bump } = useApp();
  const [name, setName] = useState(c?.name ?? '');
  const [contact, setContact] = useState(c?.contact ?? '');
  const [phone, setPhone] = useState(c?.phone ?? '');
  const [email, setEmail] = useState(c?.email ?? '');
  const [address, setAddress] = useState(c?.address ?? '');
  const [tax, setTax] = useState(c?.tax_no ?? '');
  const [status, setStatus] = useState(c?.status ?? 'Aktif');
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      await repo.customers.save({ name, contact, phone, email, address, tax_no: tax, status }, c?.id);
      bump(); onClose();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
  };
  return (
    <FormModal visible title={c ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'} onClose={onClose} onSave={save} error={err}>
      <TextField label="Müşteri / Firma Adı *" value={name} onChange={setName} autoCapitalize="words" />
      <Muted>{c ? `Kod: ${c.code}` : 'Kod, isme göre otomatik oluşturulur.'}</Muted>
      <TextField label="Yetkili" value={contact} onChange={setContact} autoCapitalize="words" />
      <TextField label="Telefon" value={phone} onChange={setPhone} keyboardType="phone-pad" />
      <TextField label="E-posta" value={email} onChange={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextField label="Adres" value={address} onChange={setAddress} multiline />
      <TextField label="Vergi No" value={tax} onChange={setTax} />
      <ChoiceField label="Durum" value={status as any} options={CUSTOMER_STATUSES as any} onChange={setStatus} />
    </FormModal>
  );
}
