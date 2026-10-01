import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { changePct, dmy, MONTHS_SHORT, money, num, prevMonthKey } from '../domain/format';
import { useData } from '../state/app';
import { Badge, Banner, Button, Card, EmptyState, InfoRow, Kpi, KpiGrid, Muted, MonthBars, ProgressBar, Screen, SectionTitle } from '../ui/kit';
import { Chips } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

const trend = (p: number | null) => (p === null ? undefined : `${p >= 0 ? '↑' : '↓'} %${num(Math.abs(p), 0)} geçen aya göre`);

export default function DashboardScreen() {
  const router = useRouter();
  const [year, setYear] = useState<string | null>(null);
  const { data, loading, error, reload } = useData(async (r) => {
    const cur = r.metrics.thisMonth();
    const prev = prevMonthKey(cur);
    const years = await r.metrics.yearsWithData();
    const y = year && years.includes(year) ? year : years[0];
    const stocks = await r.stock.list({ inStock: true, withProducts: true });
    const counts = await r.metrics.counts(cur);
    const salesCur = await r.metrics.salesTotal({ month: cur });
    const salesPrev = await r.metrics.salesTotal({ month: prev });
    const netCur = await r.metrics.net({ month: cur });
    const netPrev = await r.metrics.net({ month: prev });
    const rec = await r.metrics.receivables();
    const over = await r.metrics.overdueReceivables();
    const total = await r.metrics.salesTotal();
    const tx = (await r.sales.transactions()).slice(0, 5);
    const orders = (await r.orders.list()).filter((w) => w.status === 'Bekliyor' || w.status === 'Üretimde').slice(0, 5);
    return {
      years, y, stocks, productCount: counts.products, newProducts: counts.newProducts, customerCount: counts.customers,
      salesCur, salesPrev, netCur, netPrev, rec, over, total, tx, orders, months: await r.metrics.monthlySales(y),
    };
  }, [year]);

  if (!data) return <Screen loading={loading} error={error}>{null}</Screen>;
  const critical = data.stocks.filter((s) => s.status === 'Kritik');
  const near = data.stocks.filter((s) => s.status === 'Minimuma Yakın');
  const rate = data.total ? ((data.total - data.rec) / data.total) * 100 : 0;
  const empty = !data.productCount && !data.stocks.length && !data.customerCount;

  return (
    <Screen onRefresh={reload} error={error}>
      {empty ? <Banner text="Veritabanı boş. Başlamak için sırasıyla Malzeme Bileşenleri, Ürünler ve Müşteriler ekleyin; ardından Satış ve Sipariş oluşturabilirsiniz. (Daha Fazla sekmesinden ulaşabilirsiniz.)" /> : null}
      <KpiGrid>
        <Kpi label="Toplam Ürün" value={num(data.productCount)} icon="cube-outline" tone="blue" sub={data.newProducts ? `↑ ${data.newProducts} yeni` : undefined} />
        <Kpi label="Bu Ay Satış" value={money(data.salesCur)} icon="cash-outline" tone="green" sub={trend(changePct(data.salesCur, data.salesPrev))} />
        <Kpi label="Net Kâr" value={money(data.netCur)} icon="trending-up-outline" tone="purple" sub={trend(changePct(data.netCur, data.netPrev))} />
        <Kpi label="Kritik Stok" value={num(critical.length)} icon="alert-circle-outline" tone="red" sub={near.length ? `${near.length} min. yakın` : undefined} />
      </KpiGrid>

      <Card style={{ gap: 12 }}>
        <SectionTitle>Aylık Satışlar</SectionTitle>
        {data.years.length > 1 ? <Chips options={data.years} value={data.y} onChange={setYear} /> : null}
        <MonthBars values={data.months} labels={MONTHS_SHORT} format={money} />
      </Card>

      <Card style={{ gap: 8 }}>
        <SectionTitle right={<Button compact title="Tümü" onPress={() => router.push('/finance')} />}>Son İşlemler</SectionTitle>
        {data.tx.length ? data.tx.map((t) => (
          <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>{t.sale_id ? `Satış #${t.doc_no}` : t.description || t.category}</Text>
              <Muted>{dmy(t.date)}</Muted>
            </View>
            <Text style={{ color: t.type === 'Gelir' ? colors.green : colors.red, fontWeight: '600' }}>{money(t.type === 'Gelir' ? t.amount : -t.amount)}</Text>
          </View>
        )) : <Muted>Henüz işlem yok.</Muted>}
      </Card>

      <Card style={{ gap: 8 }}>
        <SectionTitle right={<Button compact title="Stoka git" onPress={() => router.push('/stock')} />}>Kritik Stoklar</SectionTitle>
        {critical.length + near.length ? [...critical, ...near].slice(0, 6).map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>{s.name}</Text>
              <Muted>{num(s.quantity)} {s.unit} · min. {num(s.min_qty)}</Muted>
            </View>
            <Badge text={s.status} tone={statusTone(s.status)} />
          </View>
        )) : <Muted>Kritik stok yok. 👍</Muted>}
      </Card>

      <Card style={{ gap: 8 }}>
        <SectionTitle right={<Button compact title="Tümü" onPress={() => router.push('/orders')} />}>Bekleyen Siparişler</SectionTitle>
        {data.orders.length ? data.orders.map((w) => (
          <View key={w.id} style={{ gap: 4, paddingVertical: 3 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{w.code} · {w.product}</Text>
              <Badge text={w.status} tone={statusTone(w.status)} />
            </View>
            <ProgressBar value={w.progress} />
            <Muted>{num(w.quantity, 0)} adet · termin {dmy(w.due_date)}</Muted>
          </View>
        )) : <Muted>Bekleyen sipariş yok.</Muted>}
      </Card>

      <Card style={{ gap: 6 }}>
        <SectionTitle right={<Button compact title="Müşteriler" onPress={() => router.push('/customers')} />}>Cari Özet</SectionTitle>
        <InfoRow label="Alacaklar" value={money(data.rec)} />
        <InfoRow label="Vadesi geçen" value={money(data.over)} />
        <Muted>Tahsilat oranı: %{num(rate, 0)}</Muted>
        <ProgressBar value={rate} tone="green" />
      </Card>
      {empty ? <EmptyState text="Henüz veri yok." /> : null}
    </Screen>
  );
}
