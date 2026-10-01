import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { STOCK_CATEGORIES } from '../db/schema';
import type { StockItem } from '../db/types';
import { money, num } from '../domain/format';
import { matches } from '../domain/search';
import { MaterialForm } from '../components/MaterialForm';
import { AddStockForm } from '../components/StockForms';
import { deleteImage, imageUri } from '../services/images';
import { useApp, useData } from '../state/app';
import { confirm, info } from '../ui/forms';
import { Badge, Button, ButtonRow, Card, Chips, EmptyState, InfoRow, Kpi, KpiGrid, ListRow, Muted, Screen, SearchBar } from '../ui/kit';
import { colors } from '../ui/theme';

const FILTERS = ['Tümü', ...STOCK_CATEGORIES] as const;

export default function MaterialsScreen() {
  const router = useRouter();
  const { repo, bump } = useApp();
  const [q, setQ] = useState('');
  const [f, setF] = useState<(typeof FILTERS)[number]>('Tümü');
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<StockItem | 'new' | null>(null);
  const [toStock, setToStock] = useState<StockItem | null>(null);
  const { data, loading, error, reload } = useData((r) => r.stock.list());
  const list = useMemo(() => (data ?? []).filter((i) => (f === 'Tümü' || i.category === f) && matches(q, i.code, i.name, i.grade, i.size)), [data, q, f]);
  const all = data ?? [];

  return (
    <Screen loading={loading && !data} error={error} onRefresh={reload} fab={{ onPress: () => setForm('new') }}>
      <KpiGrid>
        <Kpi label="Malzeme Bileşeni" value={num(all.length)} icon="grid-outline" tone="blue" />
        <Kpi label="Stokta Takip Edilen" value={num(all.filter((i) => i.in_stock).length)} icon="file-tray-stacked-outline" tone="green" />
        <Kpi label="Stoğa Eklenmemiş" value={num(all.filter((i) => !i.in_stock).length)} icon="remove-circle-outline" tone="yellow" />
      </KpiGrid>
      <SearchBar value={q} onChange={setQ} placeholder="Bileşen ara..." />
      <Chips options={FILTERS} value={f} onChange={setF} />
      {!list.length ? <EmptyState text={all.length ? 'Filtreye uyan bileşen yok.' : 'İlk bileşeni eklemek için + düğmesini kullanın.'} /> : null}
      {list.map((i) => {
        const expanded = open === i.id;
        return (
          <Card key={i.id} style={{ padding: 0 }}>
            <ListRow title={i.name} photo={imageUri(i.photo)}
              subtitle={`${i.code} · ${i.category}${i.size ? ` · ${i.size}` : ''}${i.grade ? ` · ${i.grade}` : ''}`}
              meta={money(i.unit_cost)}
              right={i.in_stock ? <Badge text="Stokta" tone="green" /> : <Badge text="Stokta değil" tone="gray" />}
              badge={i.unit_weight > 0 ? <Text style={{ color: colors.muted, fontSize: 12 }}>{num(i.unit_weight)} kg/parça{i.kg_price ? ` · ${money(i.kg_price)}/kg` : ''}</Text> : undefined}
              onPress={() => setOpen(expanded ? null : i.id)} />
            {expanded ? (
              <Card style={{ gap: 8, borderWidth: 0 }}>
                <InfoRow label="Birim" value={i.unit} />
                <InfoRow label="Minimum stok" value={`${num(i.min_qty)} ${i.unit}`} />
                {i.in_stock ? <InfoRow label="Mevcut" value={`${num(i.quantity)} ${i.unit}`} /> : <Muted>Bu bileşen Stok sayfasında takip edilmiyor.</Muted>}
                <ButtonRow>
                  <Button compact kind="primary" icon="create-outline" title="Düzenle" onPress={() => setForm(i)} />
                  {i.in_stock ? (
                    <>
                      <Button compact title="Stok Detayı" onPress={() => router.push(`/stock/${i.id}`)} />
                      <Button compact title="− Stoktan Kaldır" onPress={async () => { const e = await repo.stock.removeFromStock(i.id); if (e) info('Kaldırılamadı', e); else bump(); }} />
                    </>
                  ) : <Button compact title="＋ Stoğa Ekle" onPress={() => setToStock(i)} />}
                  <Button compact kind="danger" icon="trash-outline" title="Sil" onPress={() => confirm('Bileşeni sil', `${i.name} silinsin mi?`, async () => {
                    const r = await repo.stock.remove(i.id);
                    if (r.error) return info('Silinemedi', r.error);
                    deleteImage(r.removedImage); setOpen(null); bump();
                  })} />
                </ButtonRow>
              </Card>
            ) : null}
          </Card>
        );
      })}
      {form ? <MaterialForm item={form === 'new' ? null : form} onClose={() => setForm(null)} /> : null}
      {toStock ? <AddStockForm item={toStock} onClose={() => setToStock(null)} /> : null}
    </Screen>
  );
}
