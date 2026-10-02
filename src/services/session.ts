import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export interface Session { url: string; token: string }

const KEY = 'atolye_session_v1';
const URL_KEY = 'atolye_server_url';

let current: Session | null = null;
export const getSession = () => current;
export const setSessionMemory = (s: Session | null) => { current = s; };

export function defaultServerUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { serverUrl?: string };
  return extra.serverUrl ?? '';
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.url || !s.token) return null;
    current = s;
    return s;
  } catch {
    return null;
  }
}
export async function saveSession(s: Session): Promise<void> {
  current = s;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(s));
    await SecureStore.setItemAsync(URL_KEY, s.url);
  } catch { /* oturum yalnızca bellekte kalır */ }
}
export async function clearSession(): Promise<void> {
  current = null;
  try { await SecureStore.deleteItemAsync(KEY); } catch { /* yoksay */ }
}
export async function lastServerUrl(): Promise<string> {
  try { return (await SecureStore.getItemAsync(URL_KEY)) || defaultServerUrl(); } catch { return defaultServerUrl(); }
}

export function normalizeUrl(u: string): string {
  let x = u.trim().replace(/\/+$/, '');
  if (x && !/^https?:\/\//i.test(x)) x = `https://${x}`;
  return x;
}

/** Sunucuya giriş; başarılıysa oturumu kaydeder. */
export async function login(url: string, username: string, password: string): Promise<Session> {
  const base = normalizeUrl(url);
  if (!base) throw new Error('Sunucu adresi girin.');
  let res: Response;
  try {
    res = await fetch(`${base}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
  } catch {
    throw new Error('Sunucuya ulaşılamadı. İnternet bağlantısını ve adresi kontrol edin.');
  }
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error ?? `Giriş başarısız (${res.status}).`);
  const s = { url: base, token: body.token };
  await saveSession(s);
  return s;
}
