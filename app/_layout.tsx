import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { AppProvider } from '../src/state/app';
import { colors } from '../src/ui/theme';

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.card },
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
          headerBackTitle: 'Geri',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="planning" options={{ title: 'Üretim Planı' }} />
        <Stack.Screen name="machines" options={{ title: 'Makineler' }} />
        <Stack.Screen name="materials" options={{ title: 'Malzeme Bileşenleri' }} />
        <Stack.Screen name="customers" options={{ title: 'Müşteriler' }} />
        <Stack.Screen name="sales" options={{ title: 'Satışlar' }} />
        <Stack.Screen name="finance" options={{ title: 'Gelir / Gider' }} />
        <Stack.Screen name="reports" options={{ title: 'Raporlar' }} />
        <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />
        <Stack.Screen name="product/[id]" options={{ title: 'Ürün' }} />
        <Stack.Screen name="stock/[id]" options={{ title: 'Stok Kalemi' }} />
      </Stack>
    </AppProvider>
  );
}
