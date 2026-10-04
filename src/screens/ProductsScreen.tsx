import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { money, num } from '../domain/format';
import { matches } from '../domain/search';
import { ProductForm } from '../components/ProductForm';
import { imageUri } from '../services/images';
import { useData } from '../state/app';
import { Badge, Chips, EmptyState, ListRow, Screen, SearchBar } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

const FILTERS = ['Tümü', 'Aktif', 'Pasif'] as const;

export default function ProductsScreen() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [f, setF] = useState<(typeof FILTERS)[number]>('Tümü');
  const [form, setForm] = useState(false);
  const { data, loading, error, reload } = useData((r) => r.products.withStats());
  const list = useMemo(() => (data ?? []).filter((p) => (f === 'Tümü' || p.status === f) && matches(q, p.code, p.name, p.category)), [data, q, f]);

  return (
    <Screen loading={loading && !data} error={error} onRefresh={reload} fab={{ onPress: () => setForm(true) }}>
      <SearchBar value={q} onChange={setQ} placeholder="Ürün ara..." />
      <Chips options={FILTERS} value={f} onChange={setF} />
      {!list.length ? <EmptyState text={data?.length ? 'Filtreye uyan ürün yok.' : 'İlk ürünü eklemek için + düğmesini kullanın.'} /> : null}
      {list.map((p) => (
        <ListRow key={p.id} title={p.name} photo={imageUri(p.image)} emoji={p.icon}
          subtitle={`${p.code} · ${p.category} · ${p.material_count} malzeme · ${p.operation_count} operasyon (${num(p.total_minutes + p.setup_total)} dk)`}
          meta={money(p.unit_price)} right={<Badge text={p.status} tone={statusTone(p.status)} />}
          badge={p.material_cost ? <Text style={{ color: colors.muted, fontSize: 12 }}>Malzeme maliyeti {money(p.material_cost)}</Text> : undefined}
          onPress={() => router.push(`/product/${p.id}`)} />
      ))}
      {form ? <ProductForm product={null} onClose={() => setForm(false)} onSaved={(id) => router.push(`/product/${id}`)} /> : null}
    </Screen>
  );
}
