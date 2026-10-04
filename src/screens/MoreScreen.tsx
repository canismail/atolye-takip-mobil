import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { initials } from '../domain/format';
import { useApp } from '../state/app';
import { Card, ListRow, Muted, Screen, SectionTitle } from '../ui/kit';
import { colors } from '../ui/theme';

const ITEMS: { path: string; title: string; sub: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { path: '/planning', title: 'Üretim Planı', sub: 'Günlük / haftalık kapasite, termin takvimi', icon: 'calendar-outline' },
  { path: '/machines', title: 'Makineler', sub: 'Tezgâh tanımı, aktif/pasif, günlük çalışma saati', icon: 'hardware-chip-outline' },
  { path: '/materials', title: 'Malzeme Bileşenleri', sub: 'Hammadde, yedek parça, ağırlık ve maliyet', icon: 'grid-outline' },
  { path: '/customers', title: 'Müşteriler', sub: 'Cari bilgileri ve bakiyeler', icon: 'people-outline' },
  { path: '/sales', title: 'Satışlar', sub: 'Satış kayıtları ve tahsilat', icon: 'cash-outline' },
  { path: '/finance', title: 'Gelir / Gider', sub: 'Kasa hareketleri', icon: 'swap-vertical-outline' },
  { path: '/reports', title: 'Raporlar', sub: 'Aylık özet, en çok satanlar, stok devri', icon: 'bar-chart-outline' },
  { path: '/settings', title: 'Ayarlar', sub: 'Şirket, malzeme yoğunlukları, yedekleme', icon: 'settings-outline' },
];

export default function MoreScreen() {
  const router = useRouter();
  const { settings } = useApp();
  return (
    <Screen>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{initials(settings.user_name)}</Text>
        </View>
        <View>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>{settings.user_name}</Text>
          <Muted>{settings.company_name}</Muted>
        </View>
      </Card>
      <SectionTitle>Diğer Sayfalar</SectionTitle>
      {ITEMS.map((i) => (
        <ListRow key={i.path} title={i.title} subtitle={i.sub} onPress={() => router.push(i.path as any)}
          right={<Ionicons name={i.icon} size={22} color={colors.primary} />} />
      ))}
    </Screen>
  );
}
