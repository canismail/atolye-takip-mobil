import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { dmy, money, num } from '../domain/format';
import { MaterialForm } from '../components/MaterialForm';
import { MovementForm } from '../components/StockForms';
import { imageUri } from '../services/images';
import { useData } from '../state/app';
import { Badge, Button, ButtonRow, Card, EmptyState, InfoRow, Muted, Screen, SectionTitle, Thumb } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

export default function StockDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sid = Number(id);
  const router = useRouter();
  const [move, setMove] = useState(false);
  const [edit, setEdit] = useState(false);
  const { data, loading, error, reload } = useData(async (r) => ({
    item: await r.stock.get(sid), mv: await r.stock.movements(sid), used: await r.stock.usedIn(sid),
  }), [sid]);
  if (!data) return <Screen loading={loading} error={error}>{null}</Screen>;
  const { item, mv, used } = data;
  if (!item) return <Screen><EmptyState text="Kalem bulunamadı." /></Screen>;
  const photo = imageUri(item.photo);
  const total = item.unit_weight > 0 && item.unit === 'adet' ? ` · toplam ${num(item.quantity * item.unit_weight)} kg` : '';

  return (
    <Screen onRefresh={reload} error={error}>
      <Stack.Screen options={{ title: item.name }} />
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {photo ? <Thumb uri={photo} size={80} /> : null}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{item.name}</Text>
            <Muted>{item.code} · {item.category}</Muted>
            <Badge text={item.status} tone={statusTone(item.status)} />
          </View>
        </View>
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.primary }}>{num(item.quantity)} <Text style={{ fontSize: 16, color: colors.muted }}>{item.unit}</Text></Text>
        {item.size || item.grade ? (
          <Muted>{item.size}{item.grade ? ` · ${item.grade}` : ''}{item.unit_weight > 0 ? ` · ${num(item.unit_weight)} kg/parça` : ''}{total}</Muted>
        ) : null}
        <InfoRow label="Minimum stok" value={`${num(item.min_qty)} ${item.unit}`} />
        <InfoRow label="Birim maliyet" value={money(item.unit_cost)} />
        {item.product_id ? <InfoRow label="Satış fiyatı" value={money(item.sale_price ?? 0)} /> : null}
        <InfoRow label="Stok değeri" value={money(item.value)} />
        <ButtonRow>
          <Button kind="primary" icon="swap-vertical" title="Stok Hareketi" onPress={() => setMove(true)} />
          {item.product_id ? (
            <Button icon="open-outline" title="Ürünü Aç" onPress={() => router.push(`/product/${item.product_id}`)} />
          ) : (
            <Button icon="create-outline" title="Bilgiyi Düzenle" onPress={() => setEdit(true)} />
          )}
        </ButtonRow>
        {used.length ? <Muted>Kullanıldığı ürünler: {used.map((u) => `${u.name} (${num(u.quantity)} ${item.unit})`).join(', ')}</Muted> : null}
      </Card>

      <SectionTitle>Hareket Geçmişi</SectionTitle>
      {!mv.length ? <EmptyState text="Henüz hareket yok." /> : mv.map((m) => (
        <Card key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: colors.text }}>{dmy(m.date)}</Text>
            <Muted>{m.note || '-'}</Muted>
          </View>
          <Text style={{ fontWeight: '700', color: m.change >= 0 ? colors.green : colors.red }}>{m.change > 0 ? '+' : ''}{num(m.change)} {item.unit}</Text>
        </Card>
      ))}
      {move ? <MovementForm item={item} onClose={() => setMove(false)} /> : null}
      {edit ? <MaterialForm item={item} onClose={() => setEdit(false)} /> : null}
    </Screen>
  );
}
