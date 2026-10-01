import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../db/schema';
import type { Transaction } from '../db/types';
import { dmy, money, monthLabel, numInput, today } from '../domain/format';
import { matches } from '../domain/search';
import { useApp, useData } from '../state/app';
import { ChoiceField, confirm, DateField, FormModal, n, NumberField, SelectField, TextField } from '../ui/forms';
import { Badge, Button, ButtonRow, Card, Chips, EmptyState, Kpi, KpiGrid, Muted, Screen, SearchBar } from '../ui/kit';
import { colors } from '../ui/theme';

const TYPES = ['Tümü', 'Gelir', 'Gider'] as const;

export default function FinanceScreen() {
  const { repo, bump } = useApp();
  const [q, setQ] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('Tümü');
  const [month, setMonth] = useState<string>('Tümü');
  const [form, setForm] = useState<Transaction | 'new' | null>(null);
  const { data, loading, error, reload } = useData(async (r) => ({ list: await r.sales.transactions(), months: await r.metrics.monthsWithData() }));
  const months = ['Tümü', ...(data?.months ?? [])];
  const list = useMemo(() => (data?.list ?? []).filter((t) => (type === 'Tümü' || t.type === type) && (month === 'Tümü' || t.date.slice(0, 7) === month) && matches(q, t.description, t.category, t.doc_no, t.type)), [data, q, type, month]);
  const income = list.filter((t) => t.type === 'Gelir').reduce((a, t) => a + t.amount, 0);
  const expense = list.filter((t) => t.type === 'Gider').reduce((a, t) => a + t.amount, 0);

  return (
    <Screen loading={loading && !data} error={error} onRefresh={reload} fab={{ onPress: () => setForm('new') }}>
      <KpiGrid>
        <Kpi label="Gelir" value={money(income)} icon="arrow-down-circle-outline" tone="green" />
        <Kpi label="Gider" value={money(expense)} icon="arrow-up-circle-outline" tone="red" />
        <Kpi label="Net" value={money(income - expense)} icon="analytics-outline" tone={income - expense >= 0 ? 'blue' : 'red'} />
      </KpiGrid>
      <SearchBar value={q} onChange={setQ} placeholder="İşlem ara..." />
      <Chips options={TYPES} value={type} onChange={setType} />
      <Chips options={months} value={month} onChange={setMonth} />
      {month !== 'Tümü' ? <Muted>{monthLabel(month)}</Muted> : null}
      {!list.length ? <EmptyState text={data?.list.length ? 'Filtreye uyan işlem yok.' : 'İlk gelir/gider kaydını eklemek için + düğmesini kullanın.'} /> : null}
      {list.map((t) => (
        <Card key={t.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexShrink: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>{t.sale_id ? `Satış #${t.doc_no}` : t.description || t.category}</Text>
              <Muted>{dmy(t.date)} · {t.category}{t.doc_no && !t.sale_id ? ` · ${t.doc_no}` : ''}</Muted>
            </View>
            <Text style={{ fontWeight: '700', color: t.type === 'Gelir' ? colors.green : colors.red }}>{money(t.type === 'Gelir' ? t.amount : -t.amount)}</Text>
          </View>
          {t.sale_id ? <Badge text="Satıştan otomatik" tone="blue" /> : (
            <ButtonRow>
              <Button compact icon="create-outline" title="Düzenle" onPress={() => setForm(t)} />
              <Button compact kind="danger" icon="trash-outline" title="Sil" onPress={() => confirm('Kaydı sil', `${t.category} ${money(t.amount)} silinsin mi?`, async () => { await repo.sales.removeTransaction(t.id); bump(); })} />
            </ButtonRow>
          )}
        </Card>
      ))}
      {form ? <TxForm t={form === 'new' ? null : form} onClose={() => setForm(null)} /> : null}
    </Screen>
  );
}

function TxForm({ t, onClose }: { t: Transaction | null; onClose: () => void }) {
  const { repo, bump } = useApp();
  const [kind, setKind] = useState<'Gelir' | 'Gider'>(t?.type ?? 'Gider');
  const [cat, setCat] = useState(t?.category ?? '');
  const [custom, setCustom] = useState('');
  const [desc, setDesc] = useState(t?.description ?? '');
  const [doc, setDoc] = useState(t?.doc_no ?? '');
  const [amount, setAmount] = useState(numInput(t?.amount ?? 0));
  const [on, setOn] = useState<string | null>(t?.date ?? today());
  const [used, setUsed] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { repo.sales.usedCategories(kind).then(setUsed); }, [repo, kind]);
  const base = kind === 'Gelir' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const cats = [...base, ...used.filter((c) => !base.includes(c))];
  const current = cat && cats.includes(cat) ? cat : cats[0];

  const save = async () => {
    try {
      await repo.sales.saveTransaction({ date: on ?? today(), type: kind, category: custom.trim() || current, description: desc, doc_no: doc, amount: n(amount) }, t?.id);
      bump(); onClose();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
  };
  return (
    <FormModal visible title={t ? 'Kaydı Düzenle' : 'Gelir / Gider'} onClose={onClose} onSave={save} error={err}>
      <ChoiceField label="Tür" value={kind} options={['Gelir', 'Gider'] as const} onChange={(v) => { setKind(v); setCat(''); }} />
      <SelectField label="Kategori" value={current} options={cats.map((c) => ({ value: c, label: c }))} onChange={setCat} />
      <TextField label="Yeni kategori (isteğe bağlı)" value={custom} onChange={setCustom} hint="Doldurursan yukarıdaki seçim yerine bu kullanılır." />
      <TextField label="Açıklama" value={desc} onChange={setDesc} placeholder="Örn. Atölye kirası" />
      <TextField label="Belge No" value={doc} onChange={setDoc} placeholder="F-0001" />
      <NumberField label="Tutar" value={amount} onChange={setAmount} />
      <DateField label="Tarih" value={on} onChange={setOn} />
    </FormModal>
  );
}

