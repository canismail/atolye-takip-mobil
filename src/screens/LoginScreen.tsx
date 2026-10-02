import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { lastServerUrl, login, type Session } from '../services/session';
import { Button } from '../ui/kit';
import { colors } from '../ui/theme';

export default function LoginScreen({ onDone }: { onDone: (s: Session) => void }) {
  const [url, setUrl] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { lastServerUrl().then((u) => { setUrl(u); setReady(true); }); }, []);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      onDone(await login(url, user, pass));
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setBusy(false);
    }
  };

  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: colors.text } as const;

  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text }}>Atölye Yönetim</Text>
        <Text style={{ color: colors.muted, marginBottom: 8 }}>Devam etmek için giriş yapın.</Text>
        <TextInput value={url} onChangeText={setUrl} placeholder="Sunucu adresi (https://...)" placeholderTextColor={colors.muted}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
        <TextInput value={user} onChangeText={setUser} placeholder="Kullanıcı adı" placeholderTextColor={colors.muted}
          autoCapitalize="none" autoCorrect={false} style={input} />
        <TextInput value={pass} onChangeText={setPass} placeholder="Şifre" placeholderTextColor={colors.muted}
          secureTextEntry autoCapitalize="none" autoCorrect={false} onSubmitEditing={submit} style={input} />
        {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
        <Button kind="primary" title="Giriş yap" loading={busy} disabled={!url || !user || !pass} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
