import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { MaterialType } from '../db/types';
import { numInput } from '../domain/format';
import { pickBackup, shareBackup } from '../services/backupFile';
import { clearAllImages } from '../services/images';
import { useApp, useData } from '../state/app';
import { ChoiceField, confirm, Field, info, n, NumberField, TextField } from '../ui/forms';
import { Banner, Button, ButtonRow, Card, Muted, Screen, SectionTitle } from '../ui/kit';
import { colors } from '../ui/theme';

export default function SettingsScreen() {
  const { data, loading, error } = useData(async (r) => ({ S: await r.settings.getAll(), types: await r.settings.materialTypes() }));
  if (!data) return <Screen loading={loading} error={error}>{null}</Screen>;
  return (
    <Screen error={error}>
      <CompanyCard S={data.S} />
      <GeneralCard S={data.S} />
      <TargetsCard S={data.S} />
      <MaterialTypesCard initial={data.types} />
      <BackupCard />
      <AccountCard />
      <Card style={{ gap: 6 }}>
        <SectionTitle>Hesaplama Mantığı</SectionTitle>
        <Muted>Birim ağırlık (kg) = hacim (cm³) × yoğunluk (g/cm³) ÷ 1000. Dikdörtgen: en × boy × uzunluk; yuvarlak: π/4 × çap² × uzunluk (mm). Birim maliyet = birim ağırlık × kg fiyatı; ölçü yoksa kg fiyatı birim maliyet olur. Yoğunluk değişince tüm hammaddeler yeniden hesaplanır.</Muted>
      </Card>
      <Card style={{ gap: 6 }}>
        <SectionTitle>Hakkında</SectionTitle>
        <Muted>Atölye Yönetim · mobil sürüm 0.1.0. Veriler merkezi sunucuda tutulur; aynı hesapla giriş yapan tüm cihazlar aynı veriyi görür.</Muted>
      </Card>
    </Screen>
  );
}

function useSaver() {
  const { repo, bump } = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (v: Record<string, string>) => { await repo.settings.set(v); bump(); setMsg('Kaydedildi.'); setTimeout(() => setMsg(null), 2000); };
  return { save, msg };
}

function CompanyCard({ S }: { S: Record<string, string> }) {
  const { save, msg } = useSaver();
  const [f, setF] = useState({ company_name: S.company_name, user_name: S.user_name, company_phone: S.company_phone, company_email: S.company_email, company_address: S.company_address, company_tax_office: S.company_tax_office, company_tax_no: S.company_tax_no });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle>Şirket ve Kullanıcı</SectionTitle>
      <TextField label="Şirket adı" value={f.company_name} onChange={set('company_name')} autoCapitalize="words" />
      <TextField label="Kullanıcı adı" value={f.user_name} onChange={set('user_name')} autoCapitalize="words" />
      <TextField label="Telefon" value={f.company_phone} onChange={set('company_phone')} keyboardType="phone-pad" />
      <TextField label="E-posta" value={f.company_email} onChange={set('company_email')} keyboardType="email-address" autoCapitalize="none" />
      <TextField label="Adres" value={f.company_address} onChange={set('company_address')} multiline />
      <TextField label="Vergi dairesi" value={f.company_tax_office} onChange={set('company_tax_office')} />
      <TextField label="Vergi no" value={f.company_tax_no} onChange={set('company_tax_no')} />
      <Button kind="primary" title="Kaydet" onPress={() => save(f)} />
      {msg ? <Muted>{msg}</Muted> : null}
    </Card>
  );
}

function GeneralCard({ S }: { S: Record<string, string> }) {
  const { save, msg } = useSaver();
  const [cur, setCur] = useState(S.currency);
  const [tax, setTax] = useState(S.tax_rate);
  const [alert, setAlert] = useState(S.stock_alert === '1');
  const [near, setNear] = useState(S.near_min_pct);
  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle>Genel</SectionTitle>
      <ChoiceField label="Para birimi" value={cur as any} options={['TRY', 'USD', 'EUR'] as const} onChange={setCur} />
      <NumberField label="KDV oranı" value={tax} onChange={setTax} suffix="%" />
      <Field label="Stok uyarıları">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Switch value={alert} onValueChange={setAlert} />
          <Text style={{ color: colors.text }}>{alert ? 'Açık' : 'Kapalı'}</Text>
        </View>
      </Field>
      <NumberField label="Minimuma yakın eşiği" value={near} onChange={setNear} suffix="%" hint="Mevcut miktar, minimum stokun bu oranı kadar üstündeyse 'Minimuma Yakın' sayılır." />
      <Button kind="primary" title="Kaydet" onPress={() => save({ currency: cur, tax_rate: String(n(tax)), stock_alert: alert ? '1' : '0', near_min_pct: String(n(near)) })} />
      {msg ? <Muted>{msg}</Muted> : null}
    </Card>
  );
}

function TargetsCard({ S }: { S: Record<string, string> }) {
  const { save, msg } = useSaver();
  const [sales, setSales] = useState(S.sales_target);
  const [cap, setCap] = useState(S.capacity_hours);
  const [tt, setTt] = useState(S.turnover_target);
  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle>Hedefler</SectionTitle>
      <NumberField label="Aylık satış hedefi" value={sales} onChange={setSales} />
      <NumberField label="Aylık kapasite (saat)" value={cap} onChange={setCap} />
      <NumberField label="Stok devir hedefi (x)" value={tt} onChange={setTt} />
      <Button kind="primary" title="Kaydet" onPress={() => save({ sales_target: String(n(sales)), capacity_hours: String(n(cap)), turnover_target: String(n(tt)) })} />
      {msg ? <Muted>{msg}</Muted> : null}
    </Card>
  );
}

function MaterialTypesCard({ initial }: { initial: MaterialType[] }) {
  const { repo, bump } = useApp();
  const [rows, setRows] = useState(initial.map((t) => ({ name: t.name, density: numInput(t.density) })));
  const [msg, setMsg] = useState<string | null>(null);
  const upd = (i: number, k: 'name' | 'density', v: string) => setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    const clean = rows.map((r) => ({ name: r.name.trim(), density: n(r.density) })).filter((r) => r.name);
    if (clean.some((r) => !(r.density > 0))) return info('Hata', 'Yoğunluk sıfırdan büyük olmalı.');
    if (new Set(clean.map((r) => r.name.toLowerCase())).size !== clean.length) return info('Hata', 'Aynı isimde iki cins var.');
    await repo.settings.setMaterialTypes(clean);
    const count = await repo.stock.recalcHammadde();
    bump();
    setMsg(`Kaydedildi. ${count} hammaddenin ağırlık ve maliyeti yeniden hesaplandı.`);
  };
  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle>Malzeme Cinsleri ve Yoğunluklar</SectionTitle>
      <Muted>Hammadde eklerken seçilen cinse göre ağırlık otomatik hesaplanır. Yoğunluk g/cm³ cinsindendir (çelik ≈ 7,85).</Muted>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 2 }}><TextField label={i === 0 ? 'Cins' : ''} value={r.name} onChange={(v) => upd(i, 'name', v)} /></View>
          <View style={{ flex: 1 }}><NumberField label={i === 0 ? 'g/cm³' : ''} value={r.density} onChange={(v) => upd(i, 'density', v)} /></View>
          <Button compact kind="danger" icon="trash-outline" title="" onPress={() => setRows((p) => p.filter((_, j) => j !== i))} />
        </View>
      ))}
      <ButtonRow>
        <Button compact icon="add" title="Cins ekle" onPress={() => setRows((p) => [...p, { name: '', density: '' }])} />
        <Button compact kind="primary" title="Kaydet ve yeniden hesapla" onPress={save} />
      </ButtonRow>
      {msg ? <Muted>{msg}</Muted> : null}
    </Card>
  );
}

function AccountCard() {
  const { serverUrl, logout } = useApp();
  return (
    <Card style={{ gap: 8 }}>
      <SectionTitle>Hesap</SectionTitle>
      <Muted>Sunucu: {serverUrl}</Muted>
      <Button icon="log-out-outline" title="Çıkış yap" onPress={() => confirm('Çıkış yapılsın mı?', 'Bu cihazdaki oturum kapatılır. Veriler sunucuda kalır.', logout, 'Çıkış')} />
    </Card>
  );
}

function BackupCard() {
  const { repo, bump } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { info('Hata', String((e as Error).message ?? e)); } finally { setBusy(false); }
  };
  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle>Yedekleme</SectionTitle>
      <Banner text="Veriler sunucuda saklanır ve her gün otomatik yedeklenir. Buradan ayrıca elle yedek alabilirsiniz (fotoğraflar yedeğe dahil değildir)." />
      <ButtonRow>
        <Button icon="share-outline" title="Yedek al / paylaş" loading={busy} onPress={() => run(async () => shareBackup(await repo.backup.exportAll()))} />
        <Button icon="download-outline" title="Yedekten geri yükle" disabled={busy} onPress={() => run(async () => {
          const file = await pickBackup();
          if (!file) return;
          confirm('Geri yükle', 'Mevcut tüm veriler yedekteki verilerle DEĞİŞTİRİLECEK. Emin misiniz?', () => run(async () => {
            await repo.backup.importAll(file);
            bump();
            info('Tamam', 'Yedek geri yüklendi.');
          }), 'Geri Yükle');
        })} />
      </ButtonRow>
      <Button kind="danger" icon="trash-outline" title="Tüm verileri sıfırla" disabled={busy} onPress={() => confirm('Tüm veriler silinsin mi?', 'Ürün, stok, müşteri, satış, sipariş ve gelir/gider kayıtlarının TAMAMI silinir. Önce yedek almanız önerilir. Bu işlem geri alınamaz.', () => run(async () => {
        await repo.backup.resetAll(); clearAllImages(); bump(); info('Tamam', 'Tüm veriler silindi.');
      }), 'Hepsini Sil')} />
    </Card>
  );
}
