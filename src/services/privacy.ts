/** Hassas veri gizleme: durum cihazda saklanır, açmak için şifre gerekir.
 * Şifre base64 olarak yazılıdır (varsayılan: 1234). Değiştirmek için Terminal'de:  echo -n yeniSifre | base64
 * Not: base64 şifreleme değil, yalnızca gözden saklamadır. */
import * as SecureStore from 'expo-secure-store';

const PASSWORD_B64 = 'MTIzNA==';
const KEY = 'atolye_hidden';

export const checkPassword = (pw: string): boolean => {
  try { return atob(PASSWORD_B64) === pw; } catch { return false; }
};
export async function loadHidden(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(KEY)) === '1'; } catch { return false; }
}
export async function saveHidden(v: boolean): Promise<void> {
  try { await SecureStore.setItemAsync(KEY, v ? '1' : '0'); } catch { /* yalnızca bellekte */ }
}
