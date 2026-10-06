import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dmy, parseISO, parseNum, toISO } from '../domain/format';
import { emptyPhoto, imageUri, pickPhoto, type PhotoState } from '../services/images';
import { Banner, Button } from './kit';
import { colors, radius, space } from './theme';

// ---------------------------------------------------------------- form sayfası (modal)
export function FormModal(props: {
  visible: boolean; title: string; onClose: () => void; onSave: () => void | Promise<void>;
  saveLabel?: string; error?: string | null; saving?: boolean; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg,
          backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable onPress={props.onClose} hitSlop={10}><Text style={{ color: colors.muted, fontSize: 16 }}>Vazgeç</Text></Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, flexShrink: 1 }} numberOfLines={1}>{props.title}</Text>
          <Pressable onPress={props.onSave} disabled={props.saving} hitSlop={10}>
            <Text style={{ color: props.saving ? colors.muted : colors.primary, fontSize: 16, fontWeight: '700' }}>{props.saveLabel ?? 'Kaydet'}</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + 60 }}>
          {props.error ? <Banner tone="red" text={props.error} /> : null}
          {props.children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Silme / geri alınamaz işlem onayı. */
export function confirm(title: string, message: string, onYes: () => void, yesLabel = 'Sil'): void {
  Alert.alert(title, message, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: yesLabel, style: 'destructive', onPress: onYes },
  ]);
}
export const info = (title: string, message?: string) => Alert.alert(title, message);

// ---------------------------------------------------------------- alanlar
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      {children}
      {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

const inputStyle = {
  backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: colors.text,
} as const;

export function TextField(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  hint?: string; multiline?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad'; autoCapitalize?: 'none' | 'sentences' | 'words'; secure?: boolean }) {
  return (
    <Field label={props.label} hint={props.hint}>
      <TextInput value={props.value} secureTextEntry={props.secure} onChangeText={props.onChange} placeholder={props.placeholder} placeholderTextColor={colors.muted}
        multiline={props.multiline} keyboardType={props.keyboardType} autoCapitalize={props.secure ? 'none' : props.autoCapitalize ?? 'sentences'}
        style={[inputStyle, props.multiline ? { minHeight: 80, textAlignVertical: 'top' } : null]} />
    </Field>
  );
}

/** Sayı girişi: metin olarak tutulur (virgül/nokta serbest), `parseNum` ile okunur. */
export function NumberField(props: { label: string; value: string; onChange: (v: string) => void; hint?: string; suffix?: string; placeholder?: string }) {
  return (
    <Field label={props.label} hint={props.hint}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput value={props.value} onChangeText={props.onChange} keyboardType="decimal-pad" placeholder={props.placeholder ?? '0'}
          placeholderTextColor={colors.muted} style={[inputStyle, { flex: 1 }]} selectTextOnFocus />
        {props.suffix ? <Text style={{ color: colors.muted }}>{props.suffix}</Text> : null}
      </View>
    </Field>
  );
}
export const n = (s: string) => parseNum(s);

// ---------------------------------------------------------------- seçim
export interface Option<V extends string | number | null = string> { value: V; label: string; sub?: string }

export function SelectField<V extends string | number | null>(props: {
  label: string; value: V; options: Option<V>[]; onChange: (v: V) => void; placeholder?: string; hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cur = props.options.find((o) => o.value === props.value);
  const shown = q ? props.options.filter((o) => (o.label + ' ' + (o.sub ?? '')).toLowerCase().includes(q.toLowerCase())) : props.options;
  return (
    <Field label={props.label} hint={props.hint}>
      <Pressable onPress={() => { setQ(''); setOpen(true); }} style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 16, color: cur ? colors.text : colors.muted, flexShrink: 1 }} numberOfLines={1}>{cur?.label ?? props.placeholder ?? 'Seçin'}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.lg, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{props.label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}><Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Kapat</Text></Pressable>
          </View>
          {props.options.length > 8 ? (
            <View style={{ padding: space.md }}>
              <TextInput value={q} onChangeText={setQ} placeholder="Ara..." placeholderTextColor={colors.muted} style={inputStyle} autoCorrect={false} />
            </View>
          ) : null}
          <FlatList data={shown} keyExtractor={(o: Option<V>) => String(o.value)} keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
            ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>Sonuç yok</Text>}
            renderItem={({ item }: { item: Option<V> }) => (
              <Pressable onPress={() => { props.onChange(item.value); setOpen(false); }}
                style={{ padding: space.lg, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ fontSize: 16, color: colors.text }}>{item.label}</Text>
                  {item.sub ? <Text style={{ fontSize: 13, color: colors.muted }}>{item.sub}</Text> : null}
                </View>
                {item.value === props.value ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            )} />
        </View>
      </Modal>
    </Field>
  );
}

/** Birkaç seçenek için yan yana düğmeler (Gelir/Gider, Ödendi/Bekliyor gibi). */
export function ChoiceField<V extends string>(props: { label: string; value: V; options: readonly V[]; onChange: (v: V) => void }) {
  return (
    <Field label={props.label}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {props.options.map((o) => {
          const on = o === props.value;
          return (
            <Pressable key={o} onPress={() => props.onChange(o)}
              style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1,
                borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.card }}>
              <Text style={{ color: on ? colors.primary : colors.text, fontWeight: '600' }}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

// ---------------------------------------------------------------- tarih
export function DateField(props: { label: string; value: string | null; onChange: (v: string | null) => void; optional?: boolean }) {
  const [open, setOpen] = useState(false);
  const date = parseISO(props.value) ?? new Date();
  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: date, mode: 'date', onChange: (_e: unknown, d?: Date) => { if (d) props.onChange(toISO(d)); } });
    } else {
      setOpen(true);
    }
  };
  return (
    <Field label={props.label}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={show} style={[inputStyle, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={{ fontSize: 16, color: props.value ? colors.text : colors.muted }}>{props.value ? dmy(props.value) : 'Tarih seçin'}</Text>
          <Ionicons name="calendar-outline" size={18} color={colors.muted} />
        </Pressable>
        {props.optional && props.value ? (
          <Pressable onPress={() => props.onChange(null)} style={[inputStyle, { justifyContent: 'center' }]} accessibilityLabel="Tarihi temizle">
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: space.lg }} onPress={() => setOpen(false)}>
            <Pressable style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md }}>
              <DateTimePicker value={date} mode="date" display="inline" locale="tr-TR"
                onChange={(_e: unknown, d?: Date) => { if (d) props.onChange(toISO(d)); }} />
              <Button title="Tamam" kind="primary" onPress={() => setOpen(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Field>
  );
}

// ---------------------------------------------------------------- fotoğraf
export function PhotoField(props: { current: string | null | undefined; value: PhotoState; onChange: (v: PhotoState) => void; label?: string }) {
  const shown = props.value.uri ?? (props.value.removed ? null : imageUri(props.current));
  return (
    <Field label={props.label ?? 'Fotoğraf'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {shown ? (
          <Image source={{ uri: shown }} style={{ width: 96, height: 96, borderRadius: radius.md }} contentFit="cover" />
        ) : (
          <View style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.graySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image-outline" size={30} color={colors.muted} />
          </View>
        )}
        <View style={{ gap: 8 }}>
          <Button compact icon="camera-outline" title={shown ? 'Değiştir' : 'Fotoğraf ekle'}
            onPress={async () => { const u = await pickPhoto(); if (u) props.onChange({ uri: u, removed: false }); }} />
          {shown ? <Button compact kind="danger" icon="trash-outline" title="Kaldır" onPress={() => props.onChange({ uri: null, removed: true })} /> : null}
        </View>
      </View>
    </Field>
  );
}
export { emptyPhoto };
export type { PhotoState };
