import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { ProductMaterial, ProductOperation } from '../db/types';
import { dmy, money, num, numInput } from '../domain/format';
import { AddStockForm } from '../components/StockForms';
import { ProductForm } from '../components/ProductForm';
import { deleteImage, imageUri } from '../services/images';
import { useApp, useData } from '../state/app';
import { OrderForm } from './OrdersScreen';
import { confirm, FormModal, info, n, NumberField, SelectField, TextField, type Option } from '../ui/forms';
import { Badge, Banner, Button, ButtonRow, Card, EmptyState, InfoRow, Muted, ProgressBar, Screen, SectionTitle, Segmented, Thumb } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

type Tab = 'mat' | 'ops' | 'wo';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pid = Number(id);
  const router = useRouter();
  const { repo, bump } = useApp();
  const [tab, setTab] = useState<Tab>('mat');
  const [edit, setEdit] = useState(false);
  const [toStock, setToStock] = useState(false);
  const [matForm, setMatForm] = useState<ProductMaterial | 'new' | null>(null);
  const [opForm, setOpForm] = useState<ProductOperation | 'new' | null>(null);
  const [woForm, setWoForm] = useState(false);
  const { data, loading, error, reload } = useData(async (r) => ({
    p: await r.products.get(pid),
    mats: await r.products.materials(pid),
    ops: await r.products.operations(pid),
    wos: (await r.orders.list()).filter((w) => w.product_id === pid),
    srow: await r.stock.forProduct(pid),
  }), [pid]);

  if (!data) return <Screen loading={loading} error={error}>{null}</Screen>;
  const { p, mats, ops, wos, srow } = data;
  if (!p) return <Screen><EmptyState text="Ürün bulunamadı." /></Screen>;
  const photo = imageUri(p.image);
  const totalMin = ops.reduce((a, o) => a + o.minutes, 0);
  const move = async (table: 'product_materials' | 'product_operations', rowId: number, d: -1 | 1) => { await repo.products.moveRow(table, pid, rowId, d); bump(); };
  const del = (table: 'product_materials' | 'product_operations', rowId: number, label: string) =>
    confirm('Satırı sil', `${label} silinsin mi?`, async () => { await repo.products.removeRow(table, pid, rowId); bump(); });

  return (
    <Screen onRefresh={reload} error={error}>
      <Stack.Screen options={{ title: p.name }} />
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {photo ? <Thumb uri={photo} size={88} /> : (
            <View style={{ width: 88, height: 88, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 40 }}>{p.icon}</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{p.name}</Text>
            <Muted>{p.code}</Muted>
            <Badge text={p.status} tone={statusTone(p.status)} />
          </View>
        </View>
        <InfoRow label="Kategori" value={p.category} />
        <InfoRow label="Toplam süre" value={`${num(p.total_minutes + p.setup_total)} dk${p.setup_total ? ` (işleme ${num(p.total_minutes)} + sök-tak ${num(p.setup_total)})` : ''}`} />
        <InfoRow label="Malzeme maliyeti" value={money(p.material_cost)} />
        <InfoRow label="Satış fiyatı" value={money(p.unit_price)} />
        {p.description ? <Muted>{p.description}</Muted> : null}
        {srow?.in_stock ? <Muted>Stokta: {num(srow.quantity)} adet</Muted> : null}
        <ButtonRow>
          <Button compact kind="primary" icon="create-outline" title="Düzenle" onPress={() => setEdit(true)} />
          {srow?.in_stock ? (
            <Button compact title="− Stoktan Kaldır" onPress={async () => { const e = await repo.stock.removeFromStock(srow.id); if (e) info('Kaldırılamadı', e); else bump(); }} />
          ) : <Button compact title="＋ Stoğa Ekle" onPress={() => setToStock(true)} />}
          <Button compact kind="danger" icon="trash-outline" title="Sil" onPress={() => confirm('Ürünü sil', `${p.name} silinsin mi?`, async () => {
            const r = await repo.products.remove(pid);
            if (r.error) return info('Silinemedi', r.error);
            deleteImage(r.removedImage); bump(); router.back();
          })} />
        </ButtonRow>
      </Card>

      <Segmented value={tab} onChange={setTab} options={[{ value: 'mat', label: 'Malzeme' }, { value: 'ops', label: 'Operasyon' }, { value: 'wo', label: 'Sipariş' }]} />

      {tab === 'mat' ? (
        <>
          <SectionTitle right={<Button compact kind="primary" title="＋ Bileşen" onPress={() => setMatForm('new')} />}>Malzeme Bileşenleri</SectionTitle>
          {!mats.length ? <EmptyState text="Henüz bileşen yok." /> : mats.map((m, i) => (
            <Card key={m.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: colors.text, flexShrink: 1 }}>{m.seq}. {m.name}</Text>
                <Text style={{ fontWeight: '700', color: colors.text }}>{money(m.cost)}</Text>
              </View>
              <Muted>{m.code} · {num(m.quantity)} {m.unit} × {money(m.unit_cost)}</Muted>
              <ButtonRow>
                <Button compact icon="create-outline" title="Düzenle" onPress={() => setMatForm(m)} />
                <Button compact icon="arrow-up" title="" disabled={i === 0} onPress={() => move('product_materials', m.id, -1)} />
                <Button compact icon="arrow-down" title="" disabled={i === mats.length - 1} onPress={() => move('product_materials', m.id, 1)} />
                <Button compact kind="danger" icon="trash-outline" title="" onPress={() => del('product_materials', m.id, m.name)} />
              </ButtonRow>
            </Card>
          ))}
          {mats.length ? <Muted>Toplam malzeme maliyeti: {money(p.material_cost)}</Muted> : null}
        </>
      ) : null}

      {tab === 'ops' ? (
        <>
          <SectionTitle right={<Button compact kind="primary" title="＋ Operasyon" onPress={() => setOpForm('new')} />}>Operasyonlar</SectionTitle>
          {!ops.length ? <EmptyState text="Henüz operasyon yok." /> : ops.map((o, i) => (
            <Card key={o.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: colors.text, flexShrink: 1 }}>{o.seq}. {o.name}</Text>
                <Text style={{ fontWeight: '700', color: colors.text }}>{num(o.minutes)} dk</Text>
              </View>
              {o.machine_type || o.setup_minutes ? (
                <Muted>{o.machine_type ? `Makine: ${o.machine_type}` : ''}{o.machine_type && o.setup_minutes ? ' · ' : ''}{o.setup_minutes ? `Sök-tak ${num(o.setup_minutes)} dk` : ''}</Muted>
              ) : null}
              <ButtonRow>
                <Button compact icon="create-outline" title="Düzenle" onPress={() => setOpForm(o)} />
                <Button compact icon="arrow-up" title="" disabled={i === 0} onPress={() => move('product_operations', o.id, -1)} />
                <Button compact icon="arrow-down" title="" disabled={i === ops.length - 1} onPress={() => move('product_operations', o.id, 1)} />
                <Button compact kind="danger" icon="trash-outline" title="" onPress={() => del('product_operations', o.id, o.name)} />
              </ButtonRow>
            </Card>
          ))}
          {ops.length ? <Muted>Toplam süre: {num(totalMin)} dk</Muted> : null}
        </>
      ) : null}

      {tab === 'wo' ? (
        <>
          <SectionTitle right={<Button compact kind="primary" title="＋ Sipariş" onPress={() => setWoForm(true)} />}>Siparişler</SectionTitle>
          {!wos.length ? <EmptyState text="Bu ürüne ait sipariş yok." /> : wos.map((w) => (
            <Card key={w.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{w.code}</Text>
                <Badge text={w.status} tone={statusTone(w.status)} />
              </View>
              <ProgressBar value={w.progress} />
              <Muted>{w.customer || 'Stok için üretim'} · {num(w.quantity, 0)} adet · termin {dmy(w.due_date)}</Muted>
            </Card>
          ))}
        </>
      ) : null}

      {edit ? <ProductForm product={p} onClose={() => setEdit(false)} /> : null}
      {toStock ? <AddStockForm product={p} onClose={() => setToStock(false)} /> : null}
      {matForm ? <BomForm productId={pid} row={matForm === 'new' ? null : matForm} onClose={() => setMatForm(null)} /> : null}
      {opForm ? <OpForm productId={pid} row={opForm === 'new' ? null : opForm} onClose={() => setOpForm(null)} /> : null}
      {woForm ? <OrderForm wo={null} defaultProductId={pid} onClose={() => setWoForm(false)} /> : null}
    </Screen>
  );
}

function BomForm({ productId, row, onClose }: { productId: number; row: ProductMaterial | null; onClose: () => void }) {
  const { repo, bump } = useApp();
  const [opts, setOpts] = useState<(Option<number> & { unit: string; cost: number })[]>([]);
  const [sid, setSid] = useState<number | null>(row?.stock_id ?? null);
  const [qty, setQty] = useState(numInput(row?.quantity ?? 1));
  const [err, setErr] = useState<string | null>(null);
  React.useEffect(() => {
    repo.stock.list().then((l) => setOpts(l.map((i) => ({ value: i.id, label: `${i.code} · ${i.name}`, sub: `${i.unit} · ${money(i.unit_cost)}`, unit: i.unit, cost: i.unit_cost }))));
  }, [repo]);
  const cur = opts.find((o) => o.value === sid);
  const save = async () => {
    if (sid === null) return setErr('Malzeme seçin.');
    if (!(n(qty) > 0)) return setErr('Miktar sıfırdan büyük olmalı.');
    await repo.products.saveMaterialRow(productId, sid, n(qty), row?.id);
    bump(); onClose();
  };
  return (
    <FormModal visible title={row ? 'Bileşeni Düzenle' : 'Bileşen Ekle'} onClose={onClose} onSave={save} error={err}>
      {row ? <Muted>{row.code} · {row.name}</Muted> : opts.length ? (
        <SelectField label="Malzeme *" value={sid} options={opts as Option<number | null>[]} onChange={setSid} placeholder="Seçin" />
      ) : <Banner tone="yellow" text="Önce Malzeme Bileşenleri sayfasından bileşen tanımlayın." />}
      <NumberField label={`Miktar${cur ? ` (${cur.unit})` : row ? ` (${row.unit})` : ''}`} value={qty} onChange={setQty} />
      {cur ? <Muted>Maliyet: {money(cur.cost * n(qty))}</Muted> : null}
    </FormModal>
  );
}

function OpForm({ productId, row, onClose }: { productId: number; row: ProductOperation | null; onClose: () => void }) {
  const { repo, bump } = useApp();
  const [name, setName] = useState(row?.name ?? '');
  const [min, setMin] = useState(numInput(row?.minutes ?? 0));
  const [mtype, setMtype] = useState<string>(row?.machine_type ?? '');
  const [setup, setSetup] = useState(numInput(row?.setup_minutes ?? 0));
  const [types, setTypes] = useState<Option<string>[]>([]);
  const [err, setErr] = useState<string | null>(null);
  React.useEffect(() => {
    repo.machines.types().then((t) => setTypes([{ value: '', label: 'Fark etmez (herhangi bir makine)' }, ...t.map((x) => ({ value: x, label: x }))]));
  }, [repo]);
  const save = async () => {
    try { await repo.products.saveOperation(productId, name, n(min), row?.id, mtype, n(setup)); bump(); onClose(); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
  };
  return (
    <FormModal visible title={row ? 'Operasyonu Düzenle' : 'Operasyon Ekle'} onClose={onClose} onSave={save} error={err}>
      <TextField label="Operasyon *" value={name} onChange={setName} placeholder="Örn. Torna, Kaynak, Montaj" autoCapitalize="words" />
      <NumberField label="Süre (dk)" value={min} onChange={setMin} suffix="dk" />
      <SelectField label="Makine türü" value={mtype} options={types} onChange={setMtype} placeholder="Seçin" />
      <NumberField label="Sök-tak süresi (dk)" value={setup} onChange={setSetup} suffix="dk" hint="Boş/0 ise makinenin parça ayarlama süresi (varsayılan 2 saat) kullanılır." />
    </FormModal>
  );
}
