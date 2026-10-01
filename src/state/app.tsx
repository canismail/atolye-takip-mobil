import { useFocusEffect } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { openExpoDb } from '../db/expoAdapter';
import { initDb } from '../db/migrate';
import { setCurrency } from '../domain/format';
import { createRepo, type Repo } from '../repo';
import { colors } from '../ui/theme';

interface Ctx {
  repo: Repo;
  settings: Record<string, string>;
  /** Veri değişti: tüm ekranlar yeniden yüklensin. */
  bump: () => void;
  version: number;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = await openExpoDb();
        await initDb(db);
        const r = createRepo(db);
        const s = await r.settings.getAll();
        setCurrency(s.currency);
        setSettings(s);
        setRepo(r);
      } catch (e) {
        setError(String((e as Error).message ?? e));
      }
    })();
  }, []);

  const repoRef = useRef<Repo | null>(null);
  repoRef.current = repo;
  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    const r = repoRef.current;
    if (r) r.settings.getAll().then((s) => { setCurrency(s.currency); setSettings(s); });
  }, []);

  const value = useMemo(() => (repo ? { repo, settings, bump, version } : null), [repo, settings, bump, version]);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.red }}>Veritabanı açılamadı</Text>
        <Text style={{ marginTop: 8, color: colors.muted, textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }
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
