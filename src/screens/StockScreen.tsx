import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { STOCK_CATEGORIES } from '../db/schema';
import { money, num } from '../domain/format';
import { matches } from '../domain/search';
import { AddStockForm } from '../components/StockForms';
import { imageUri } from '../services/images';
import { useData } from '../state/app';
import { Badge, Chips, EmptyState, Kpi, KpiGrid, ListRow, Screen, SearchBar } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

const CATS = ['Tümü', ...STOCK_CATEGORIES, 'Ürün'] as const;
const STATUSES = ['Tüm Durumlar', 'Normal', 'Minimuma Yakın', 'Kritik'] as const;

export default function StockScreen() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<(typeof CATS)[number]>('Tümü');
  const [st, setSt] = useState<(typeof STATUSES)[number]>('Tüm Durumlar');
  const [add, setAdd] = useState(false);
  const { data, loading, error, reload } = useData(async (r) => ({
    items: await r.stock.list({ inStock: true, withProducts: true }),
    value: await r.stock.stockValue(),
  }));
  const items = data?.items ?? [];
  const list = useMemo(() => items.filter((i) => (cat === 'Tümü' || i.category === cat) && (st === 'Tüm Durumlar' || i.status === st) && matches(q, i.code, i.name, i.category, i.grade, i.size)), [items, q, cat, st]);

  return (
    <Screen loading={loading && !data} error={error} onRefresh={reload} fab={{ onPress: () => setAdd(true) }}>
      <KpiGrid>
        <Kpi label="Stok Kalemi" value={num(items.length)} icon="file-tray-stacked-outline" tone="blue" />
        <Kpi label="Stok Değeri" value={money(data?.value ?? 0)} icon="cash-outline" tone="green" />
        <Kpi label="Kritik Stok" value={num(items.filter((i) => i.status === 'Kritik').length)} icon="alert-circle-outline" tone="red" />
        <Kpi label="Minimuma Yakın" value={num(items.filter((i) => i.status === 'Minimuma Yakın').length)} icon="warning-outline" tone="yellow" />
      </KpiGrid>
      <SearchBar value={q} onChange={setQ} placeholder="Stok ara..." />
      <Chips options={CATS} value={cat} onChange={setCat} />
      <Chips options={STATUSES} value={st} onChange={setSt} />
      {!list.length ? <EmptyState text={items.length ? 'Filtreye uyan kalem yok.' : 'Stok listesi boş. + ile bir malzeme bileşeni veya ürün ekleyin.'} /> : null}
      {list.map((i) => (
        <ListRow key={i.id} title={i.name} photo={imageUri(i.photo)}
          subtitle={`${i.code} · ${i.category}${i.size ? ` · ${i.size}` : ''}`}
          meta={`${num(i.quantity)} ${i.unit}`}
          right={<Badge text={i.status} tone={statusTone(i.status)} />}
          badge={<Text style={{ color: colors.muted, fontSize: 12 }}>Min. {num(i.min_qty)} · değer {money(i.value)}</Text>}
          onPress={() => router.push(`/stock/${i.id}`)} />
      ))}
      {add ? <AddStockForm onClose={() => setAdd(false)} onDone={(id) => router.push(`/stock/${id}`)} /> : null}
    </Screen>
  );
}
