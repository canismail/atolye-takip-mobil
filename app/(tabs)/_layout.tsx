import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { colors } from '../../src/ui/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const tab = (title: string, icon: IconName, iconOn: IconName) => ({
  title,
  tabBarIcon: ({ color, focused, size }: { color: any; focused: boolean; size: number }) => (
    <Ionicons name={focused ? iconOn : icon} size={size} color={color} />
  ),
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={tab('Dashboard', 'home-outline', 'home')} />
      <Tabs.Screen name="orders" options={tab('Siparişler', 'clipboard-outline', 'clipboard')} />
      <Tabs.Screen name="products" options={tab('Ürünler', 'cube-outline', 'cube')} />
      <Tabs.Screen name="stock" options={tab('Stok', 'file-tray-stacked-outline', 'file-tray-stacked')} />
      <Tabs.Screen name="more" options={tab('Daha Fazla', 'menu-outline', 'menu')} />
    </Tabs>
  );
}
