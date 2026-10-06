import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isHidden } from '../domain/format';
import { colors, radius, space, TONES, type Tone } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------- iskelet
export function Screen(props: {
  children: React.ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
  fab?: { onPress: () => void; icon?: IconName };
  error?: string | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + (props.fab ? 96 : 40), gap: space.md }}
        keyboardShouldPersistTaps="handled"
        refreshControl={props.onRefresh ? <RefreshControl refreshing={false} onRefresh={props.onRefresh} /> : undefined}
      >
        {props.error ? <Banner tone="red" text={props.error} /> : null}
        {props.loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : props.children}
      </ScrollView>
      {props.fab ? (
        <Pressable onPress={props.fab.onPress} style={[styles.fab, { bottom: insets.bottom + 20 }]} accessibilityLabel="Ekle">
          <Ionicons name={props.fab.icon ?? 'add'} size={28} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const inner = <View style={[styles.card, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.7 : 1 })}>{inner}</Pressable> : inner;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[{ color: colors.muted, fontSize: 13 }, style]}>{children}</Text>;
}

export function Banner({ text, tone = 'blue' }: { text: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={{ backgroundColor: t.bg, padding: space.md, borderRadius: radius.md }}>
      <Text style={{ color: t.fg, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
      <Ionicons name="file-tray-outline" size={36} color={colors.muted} />
      <Text style={{ color: colors.muted, marginTop: 8, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- göstergeler
export function Badge({ text, tone = 'gray' }: { text: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={{ backgroundColor: t.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' }}>
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Kpi({ label, value, icon, tone = 'blue', sub }: { label: string; value: string; icon: IconName; tone?: Tone; sub?: string }) {
  const t = TONES[tone];
  return (
    <View style={[styles.card, { flexGrow: 1, flexBasis: '46%', gap: 6 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ backgroundColor: t.bg, width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={16} color={t.fg} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>{children}</View>;
}

export function ProgressBar({ value, tone = 'blue' }: { value: number; tone?: Tone }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height: 8, backgroundColor: colors.graySoft, borderRadius: 4, overflow: 'hidden' }}>
      <View style={{ width: `${v}%`, height: '100%', backgroundColor: TONES[tone].fg }} />
    </View>
  );
}

/** Basit yatay çubuk grafik: etiket + değer çubukları. */
export function BarList({ rows, format }: { rows: { label: string; value: number; tone?: Tone }[]; format: (v: number) => string }) {
  if (isHidden()) return <Muted>Grafik gizli (hassas veri).</Muted>;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 13 }}>{r.label}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{format(r.value)}</Text>
          </View>
          <View style={{ height: 8, backgroundColor: colors.graySoft, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${(Math.abs(r.value) / max) * 100}%`, height: '100%', backgroundColor: TONES[r.tone ?? 'blue'].fg }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** 12 aylık dikey çubuk grafik. */
export function MonthBars({ values, labels, format }: { values: number[]; labels: string[]; format: (v: number) => string }) {
  if (isHidden()) return <Muted>Grafik gizli (hassas veri).</Muted>;
  const max = Math.max(1, ...values);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
          <View accessibilityLabel={`${labels[i]}: ${format(v)}`}
            style={{ width: '100%', height: `${Math.max(2, (v / max) * 100)}%`, backgroundColor: v > 0 ? colors.primary : colors.graySoft, borderRadius: 3 }} />
          <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- girdiler
export function Button(props: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; icon?: IconName;
  disabled?: boolean; loading?: boolean; compact?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const kind = props.kind ?? 'secondary';
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.redSoft : colors.card;
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? colors.red : colors.primary;
  return (
    <Pressable onPress={props.onPress} disabled={props.disabled || props.loading}
      style={({ pressed }: { pressed: boolean }) => [{
        backgroundColor: bg, borderRadius: radius.md, paddingVertical: props.compact ? 8 : 12, paddingHorizontal: 14,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderWidth: kind === 'secondary' ? 1 : 0, borderColor: colors.border,
        opacity: props.disabled ? 0.45 : pressed ? 0.75 : 1,
      }, props.style]}>
      {props.loading ? <ActivityIndicator color={fg} /> : props.icon ? <Ionicons name={props.icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: props.compact ? 13 : 15 }}>{props.title}</Text>
    </Pressable>
  );
}
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{children}</View>;
}

export function SearchBar({ value, onChange, placeholder = 'Ara...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted}
        style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 }} autoCorrect={false} />
      {value ? <Pressable onPress={() => onChange('')} hitSlop={10}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
    </View>
  );
}

/** Yatay kaydırılan filtre çipleri. */
export function Chips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)}
            style={{ backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.border,
              borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
            <Text style={{ color: on ? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>{o}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.graySoft, borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: on ? colors.card : 'transparent', alignItems: 'center' }}>
            <Text style={{ color: on ? colors.primary : colors.muted, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- liste satırı
export function ListRow(props: {
  title: string; subtitle?: string; meta?: string; right?: React.ReactNode; onPress?: () => void;
  photo?: string | null; emoji?: string; badge?: React.ReactNode;
}) {
  return (
    <Card onPress={props.onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }}>
      {props.photo ? (
        <Image source={{ uri: props.photo }} style={styles.thumb} contentFit="cover" />
      ) : props.emoji ? (
        <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }]}>
          <Text style={{ fontSize: 22 }}>{props.emoji}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{props.title}</Text>
        {props.subtitle ? <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={2}>{props.subtitle}</Text> : null}
        {props.badge}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {props.meta ? <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{props.meta}</Text> : null}
        {props.right}
      </View>
      {props.onPress ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
    </Card>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 }}>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

export function Thumb({ uri, size = 120 }: { uri: string | null; size?: number }) {
  if (!uri) return null;
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius.md }} contentFit="cover" />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.graySoft },
  fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
});
