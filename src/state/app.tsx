import { useFocusEffect } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { setCurrency } from '../domain/format';
import type { Repo } from '../repo';
import { createApiRepo } from '../repo/api';
import { clearSession, getSession, loadSession, type Session } from '../services/session';
import LoginScreen from '../screens/LoginScreen';
import { colors } from '../ui/theme';

interface Ctx {
  repo: Repo;
  settings: Record<string, string>;
  /** Veri değişti: tüm ekranlar yeniden yüklensin. */
  bump: () => void;
  version: number;
  serverUrl: string;
  logout: () => void;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'boot' | 'login' | 'ready'>('boot');
  const [session, setSession] = useState<Session | null>(null);

  const logout = useCallback(() => {
    clearSession();
    setRepo(null);
    setSession(null);
    setPhase('login');
  }, []);

  const start = useCallback(async (sess: Session) => {
    try {
      const r = createApiRepo(getSession, logout);
      const s = await r.settings.getAll();
      setCurrency(s.currency);
      setSettings(s);
      setRepo(r);
      setSession(sess);
      setError(null);
      setPhase('ready');
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, [logout]);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      if (s) await start(s);
      else setPhase('login');
    })();
  }, [start]);

  const repoRef = useRef<Repo | null>(null);
  repoRef.current = repo;
  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    const r = repoRef.current;
    if (r) r.settings.getAll().then((s) => { setCurrency(s.currency); setSettings(s); });
  }, []);

  const value = useMemo(() => (repo && session ? { repo, settings, bump, version, serverUrl: session.url, logout } : null),
    [repo, session, settings, bump, version, logout]);

  if (error && phase === 'boot') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.red }}>Sunucuya bağlanılamadı</Text>
        <Text style={{ color: colors.muted, textAlign: 'center' }}>{error}</Text>
        <Pressable onPress={() => { setError(null); (async () => { const s = getSession(); if (s) await start(s); else setPhase('login'); })(); }}
          style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Tekrar dene</Text>
        </Pressable>
        <Pressable onPress={logout}><Text style={{ color: colors.primary }}>Farklı hesapla giriş yap</Text></Pressable>
      </View>
    );
  }
  if (phase === 'login') return <LoginScreen onDone={start} />;
  if (!value) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider eksik');
  return c;
}
export const useRepo = (): Repo => useApp().repo;

/** Veriyi yükler; ekran odaklanınca ve veri değişince (bump) yeniden yükler. */
export function useData<T>(loader: (repo: Repo) => Promise<T>, deps: React.DependencyList = []) {
  const { repo, version } = useApp();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(async () => {
    try {
      const d = await loaderRef.current(repo);
      setData(d);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, version, tick, ...deps]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
