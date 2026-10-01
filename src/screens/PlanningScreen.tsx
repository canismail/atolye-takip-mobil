import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { dmy, num, parseISO, toISO } from '../domain/format';
import { allocate, buffered, perDay, perWeek, planParams, scheduleOrders, unitsDoneByDay } from '../domain/planning';
import { matches } from '../domain/search';
import { useApp, useData } from '../state/app';
import { ChoiceField, DateField, FormModal, n, NumberField, SelectField, type Option } from '../ui/forms';
import { Badge, Button, Card, EmptyState, InfoRow, Kpi, KpiGrid, Muted, Screen, SearchBar, SectionTitle } from '../ui/kit';
import { colors, statusTone } from '../ui/theme';

const WEEKDAYS = { '5': 'Pzt - Cum (5 gün)', '6': 'Pzt - Cmt (6 gün)', '7': 'Haftanın 7 günü' } as const;

export default function PlanningScreen() {
  const { repo, bump } = useApp();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(false);
  const [calcPid, setCalcPid] = useState<number | null>(null);
  const [calcQty, setCalcQty] = useState('10');
  const [calcStart, setCalcStart] = useState<string | null>(toISO(new Date()));
  const { data, loading, error, reload } = useData(async (r) => ({
    S: await r.settings.getAll(),
    products: await r.products.withStats(),
    orders: (await r.orders.list()).filter((w) => w.status === 'Bekliyor' || w.status === 'Üretimde'),
  }));

  const P = useMemo(() => planParams(data?.S ?? {}), [data]);
  const sched = useMemo(() => (data ? scheduleOrders(data.orders, P, new Date()) : []), [data, P]);
  if (!data) return <Screen loading={loading} error={error}>{null}</Screen>;

  const ready = data.products.filter((p) => p.total_minutes > 0);
  const prod = ready.find((p) => p.id === calcPid) ?? ready[0];
  const loadH = sched.reduce((a, s) => a + s.need, 0) / 60;
  const lastEnd = sched.reduce<Date | null>((a, s) => (s.end && (!a || s.end > a) ? s.end : a), null);
  const prodOpts: Option<number>[] = ready.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));

  let calc: React.ReactNode = <Muted>Operasyon süresi girilmiş ürün yok.</Muted>;
  if (prod) {
    const unit = buffered(prod.total_minutes, P.buffer);
    const qtyN = Math.max(1, Math.floor(n(calcQty)));
    const a = allocate(qtyN * unit, parseISO(calcStart) ?? new Date(), 0, P.cap, P.weekDays);
    const done = unitsDoneByDay(a.chunks, unit);
    calc = (
      <View style={{ gap: 10 }}>
        <SelectField label="Ürün" value={prod.id} options={prodOpts} onChange={setCalcPid} />
        <NumberField label="Adet" value={calcQty} onChange={setCalcQty} />
        <DateField label="Başlangıç" value={calcStart} onChange={setCalcStart} />
        <InfoRow label="Toplam süre" value={`${num((qtyN * unit) / 60)} saat`} />
        <InfoRow label="İş günü" value={`${a.chunks.length} gün`} />
        <InfoRow label="Bitiş tarihi" value={dmy(a.end)} />
        <InfoRow label="Günlük / haftalık" value={`${perDay(P.cap, unit)} / ${perWeek(P.cap, P.weekDays, unit)} adet`} />
        <Muted>1 adet: {num(prod.total_minutes)} dk + %{num(P.buffer)} buffer = {num(unit)} dk</Muted>
        {a.chunks.map((c, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text }}>{dmy(c.day)}</Text>
            <Muted>{num(c.minutes / 60)} saat · gün sonu {done[i]} adet</Muted>
          </View>
        ))}
      </View>
    );
  }

  return (
    <Screen onRefresh={reload} error={error}>
      <KpiGrid>
        <Kpi label="Günlük Kapasite" value={`${num(P.cap / 60)} saat`} icon="time-outline" tone="blue" />
        <Kpi label="Haftalık Kapasite" value={`${num((P.cap * P.weekDays) / 60)} saat`} icon="calendar-outline" tone="green" />
        <Kpi label="Buffer" value={`%${num(P.buffer)}`} icon="layers-outline" tone="yellow" />
        <Kpi label="Açık Sipariş Yükü" value={`${num(loadH)} saat`} icon="trending-up-outline" tone="purple" sub={lastEnd ? `Bitiş: ${dmy(lastEnd)}` : undefined} />
      </KpiGrid>

      <Card style={{ gap: 6 }}>
        <SectionTitle right={<Button compact icon="create-outline" title="Düzenle" onPress={() => setEdit(true)} />}>Planlama Varsayımları</SectionTitle>
        <Muted>{num(P.hours)} saat × {P.workers} çalışan = {num(P.cap / 60)} saat/gün · {WEEKDAYS[String(P.weekDays) as keyof typeof WEEKDAYS] ?? `${P.weekDays} gün`} · Buffer'lı süre = operasyon süresi × (1 + %{num(P.buffer)})</Muted>
      </Card>

      <SectionTitle>Ürün Bazında Üretim Kapasitesi</SectionTitle>
      <SearchBar value={q} onChange={setQ} placeholder="Ürün ara..." />
      {!data.products.length ? <EmptyState text="Önce Ürünler sayfasından ürün ve operasyonlarını ekleyin." /> : null}
      {data.products.filter((p) => matches(q, p.code, p.name)).map((p) => {
        const unit = buffered(p.total_minutes, P.buffer);
        const ok = p.total_minutes > 0;
        return (
          <Card key={p.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: colors.text, flexShrink: 1 }}>{p.name}</Text>
              <Badge text={ok ? 'Hazır' : 'Operasyon yok'} tone={statusTone(ok ? 'Hazır' : 'Operasyon yok')} />
            </View>
            {ok ? (
              <>
                <Muted>{p.operation_count} operasyon · {num(p.total_minutes)} dk → buffer'lı {num(unit)} dk</Muted>
                <Text style={{ color: colors.text }}>Günlük {perDay(P.cap, unit)} adet · Haftalık {perWeek(P.cap, P.weekDays, unit)} adet</Text>
              </>
            ) : <Muted>Ürün detayından operasyon ekleyin.</Muted>}
          </Card>
        );
      })}

      <Card style={{ gap: 6 }}><SectionTitle>Üretim Hesaplayıcı</SectionTitle>{calc}</Card>

      <SectionTitle>Açık Siparişler İçin Plan</SectionTitle>
      <Muted>Bekleyen ve üretimdeki siparişler termin sırasına göre, bugünden başlayarak tek hat halinde planlanır. Tamamlanan ilerleme (%) düşülür.</Muted>
      {!sched.length ? <EmptyState text="Açık sipariş yok." /> : null}
      {sched.map((s) => (
        <Card key={s.w.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{s.w.code}</Text>
            <Badge text={s.state} tone={statusTone(s.state)} />
          </View>
          <Text style={{ color: colors.text }}>{(s.w as any).product} · kalan {s.rem} adet</Text>
          <Muted>{s.need ? `${num(s.need / 60)} saat · ${dmy(s.start)} → ${dmy(s.end)}` : 'Operasyon yok'} · termin {dmy(s.w.due_date)}</Muted>
        </Card>
      ))}

      {edit ? <ParamsForm S={data.S} onClose={() => setEdit(false)} onSave={async (v) => { await repo.settings.set(v); bump(); setEdit(false); }} /> : null}
    </Screen>
  );
}

function ParamsForm({ S, onClose, onSave }: { S: Record<string, string>; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [hours, setHours] = useState(S.plan_daily_hours);
  const [workers, setWorkers] = useState(S.plan_workers);
  const [days, setDays] = useState<keyof typeof WEEKDAYS>((S.plan_week_days in WEEKDAYS ? S.plan_week_days : '5') as keyof typeof WEEKDAYS);
  const [buf, setBuf] = useState(S.plan_buffer_pct);
  return (
    <FormModal visible title="Planlama Varsayımları" onClose={onClose} onSave={() => onSave({
      plan_daily_hours: String(Math.min(24, Math.max(0.5, n(hours) || 8))),
      plan_workers: String(Math.max(1, Math.floor(n(workers) || 1))),
      plan_week_days: days, plan_buffer_pct: String(Math.max(0, n(buf))),
    })}>
      <NumberField label="Günlük çalışma (saat)" value={hours} onChange={setHours} />
      <NumberField label="Çalışan / tezgâh sayısı" value={workers} onChange={setWorkers} hint="Aynı anda çalışan kişi/tezgâh sayısı; günlük kapasiteyi çarpar." />
      <ChoiceField label="Çalışma günleri" value={days} options={['5', '6', '7'] as const} onChange={setDays} />
      <Muted>5 = Pazartesi-Cuma, 6 = Pazartesi-Cumartesi, 7 = her gün</Muted>
      <NumberField label="Buffer (%)" value={buf} onChange={setBuf} hint="Operasyon sürelerine eklenen pay: hazırlık, bekleme, fire, hata." suffix="%" />
    </FormModal>
  );
}
