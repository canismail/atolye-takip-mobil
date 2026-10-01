import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { MONTHS_LONG, MONTHS_SHORT, money, monthLabel, num } from '../domain/format';
import { shareTextFile, toCsv } from '../services/backupFile';
import { useData } from '../state/app';
import { info } from '../ui/forms';
import { BarList, Button, Card, Chips, InfoRow, Muted, MonthBars, ProgressBar, Screen, SectionTitle } from '../ui/kit';
import { colors } from '../ui/theme';

export default function ReportsScreen() {
  const [year, setYear] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null); // "Yıl" veya ay adı
  const { data, loading, error, reload } = useData(async (r) => {
    const S = await r.settings.getAll();
    const years = await r.metrics.yearsWithData();
    const y = year && years.includes(year) ? year : years[0];
    const cur = r.metrics.thisMonth();
    return {
      S, years, y,
      salesM: await r.metrics.salesTotal({ month: cur }),
      hours: await r.metrics.productionHours(cur),
      turnover: await r.metrics.stockTurnover(String(new Date().getFullYear())),
      top: await r.metrics.topProducts(y),
      summary: await r.metrics.monthlySummary(y),
    };
  }, [year]);
  if (!data) return <Screen loading={loading} error={error}>{null}</Screen>;

  const { S, years, y, summary } = data;
  const target = Number(S.sales_target || 0), cap = Number(S.capacity_hours || 0), tt = Number(S.turnover_target || 0);
  const boxes = [
    { label: 'Satış', value: money(data.salesM), sub: `Bu ay toplam satış · hedef ${money(target)}`, p: target ? (data.salesM / target) * 100 : 0 },
    { label: 'Üretim', value: `${num(data.hours, 1)} saat`, sub: `Bu ay gerçekleşen operasyon · kapasite ${num(cap)} saat`, p: cap ? (data.hours / cap) * 100 : 0 },
    { label: 'Stok Devir', value: `${num(data.turnover, 1)}x`, sub: `Yıllık stok devir oranı · hedef ${num(tt, 1)}x`, p: tt ? (data.turnover / tt) * 100 : 0 },
  ];
  const nowM = new Date().getMonth();
  const mSel = month ?? (y === String(new Date().getFullYear()) ? MONTHS_LONG[nowM] : 'Yıl Toplamı');
  const keys = ['sales', 'income', 'production', 'personnel', 'other', 'net'] as const;
  const agg = mSel === 'Yıl Toplamı'
    ? Object.fromEntries(keys.map((k) => [k, summary.reduce((a, r) => a + r[k], 0)])) as Record<(typeof keys)[number], number>
    : summary[MONTHS_LONG.indexOf(mSel)];
  const expense = summary.map((r) => r.production + r.personnel + r.other);

  const exportCsv = async () => {
    try {
      const rows: (string | number)[][] = [['Ay', 'Satış', 'Gelir', 'Üretim Maliyeti', 'Personel', 'Diğer Giderler', 'Net'],
        ...summary.map((r) => [monthLabel(r.month), r.sales, r.income, r.production, r.personnel, r.other, r.net]),
        [], ['Kod', 'Ürün', 'Adet', 'Ciro'], ...data.top.map((t) => [t.code, t.name, t.qty, t.revenue])];
      await shareTextFile(`atolye_rapor_${y}.csv`, toCsv(rows));
    } catch (e) { info('Paylaşılamadı', String((e as Error).message ?? e)); }
  };

  return (
    <Screen onRefresh={reload} error={error}>
      {boxes.map((b) => (
        <Card key={b.label} style={{ gap: 6 }}>
          <Muted>{b.label}</Muted>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{b.value}</Text>
          <Muted>{b.sub}</Muted>
          <ProgressBar value={b.p} tone={b.p >= 100 ? 'green' : 'blue'} />
          <Muted>%{num(b.p, 0)}</Muted>
        </Card>
      ))}
      <Muted>Hedefler Ayarlar sayfasından değiştirilebilir.</Muted>

      {years.length > 1 ? <Chips options={years} value={y} onChange={(v) => { setYear(v); }} /> : null}

      <Card style={{ gap: 10 }}>
        <SectionTitle>En Çok Satan Ürünler {y}</SectionTitle>
        {data.top.length ? <BarList rows={data.top.slice(0, 10).map((t) => ({ label: `${t.name} (${num(t.qty, 0)} adet)`, value: t.revenue }))} format={money} /> : <Muted>Bu yıl satış yok.</Muted>}
      </Card>

      <Card style={{ gap: 8 }}>
        <SectionTitle>Aylık Özet</SectionTitle>
        <Chips options={['Yıl Toplamı', ...MONTHS_LONG]} value={mSel} onChange={setMonth} />
        <InfoRow label="Satış" value={money(agg.sales)} />
        <InfoRow label="Tahsil edilen gelir" value={money(agg.income)} />
        <InfoRow label="Üretim maliyeti" value={money(agg.production)} />
        <InfoRow label="Personel" value={money(agg.personnel)} />
        <InfoRow label="Diğer giderler" value={money(agg.other)} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 }}>
          <Text style={{ fontWeight: '700', color: colors.text }}>Net</Text>
          <Text style={{ fontWeight: '700', color: agg.net >= 0 ? colors.green : colors.red }}>{money(agg.net)}</Text>
        </View>
        <Muted>Üretim maliyeti: Malzeme, Enerji ve Bakım gider kategorileri.</Muted>
      </Card>

      <Card style={{ gap: 10 }}>
        <SectionTitle>{y} Gelir / Gider Trendi</SectionTitle>
        <Muted>Gelir</Muted>
        <MonthBars values={summary.map((r) => r.income)} labels={MONTHS_SHORT} format={money} />
        <Muted>Gider</Muted>
        <MonthBars values={expense} labels={MONTHS_SHORT} format={money} />
      </Card>
      <Button icon="share-outline" title="Raporu CSV olarak paylaş" onPress={exportCsv} />
    </Screen>
  );
}
